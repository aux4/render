#!/usr/bin/env node

// aux4/render — render a JSON array from stdin as a human-readable list or table.
//
// This is a zero-dependency ESM script (Node builtins only), so it is authored
// directly here rather than bundled. Four actions:
//   list  <primary> <secondary> <icon> <badge>
//   table <table> <lineNumbers> <showInvalidLines>
//   csv   <table> <lineNumbers> <showInvalidLines>
//   kv    <key> <value>
//
// Field interpolation rule (shared by --icon/--primary/--secondary/--badge and
// by --key/--value):
//   - No "$" in the value  -> if the record HAS that field (dot-notation aware),
//                             substitute the field's value (2table-style),
//                             e.g. --secondary date -> record.date. Otherwise the
//                             whole string is used as a literal constant on every
//                             row, e.g. --icon 😀 or --badge done.
//   - One or more $field    -> each $field is replaced with record[field] (empty
//     tokens                  string when missing), the rest stays literal,
//                             e.g. --primary "$firstName $lastName"
// Bare "$field" (not "${...}") is deliberate: aux4's own execute-line ${...}
// pre-substitution never touches these values, so nothing needs escaping.

import { spawnSync } from "child_process";
import fs from "fs";

function fail(message, code) {
  console.error(message);
  process.exit(code || 1);
}

function readAllStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// ANSI colors — match aux4/2table's convention (yellow header row): \x1b[33m ... \x1b[0m.
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function stringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Resolve a nested field path (dot notation) from a record.
function getField(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  if (path.indexOf(".") === -1) return obj[path];
  return path.split(".").reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

// Does the record actually contain this field path? Dot-notation aware, matching
// getField's convention: every segment must exist as an own property.
function hasField(obj, path) {
  if (obj === null || obj === undefined) return false;
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, key)) {
      return false;
    }
    cur = cur[key];
  }
  return true;
}

// Apply the field interpolation rule to a single template value.
function resolve(template, record) {
  if (template === undefined || template === null || template === "") return "";
  if (template.indexOf("$") === -1) {
    const path = template.trim();
    // Bare value: use the field's value when the record has that key; otherwise
    // fall back to treating the whole string as a literal constant for every row.
    if (hasField(record, path)) {
      return stringify(getField(record, path));
    }
    return template;
  }
  return template.replace(/\$([A-Za-z_][A-Za-z0-9_.]*)/g, (_match, path) => stringify(getField(record, path)));
}

function parseRecords(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  let value;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    fail(`Invalid JSON on stdin: ${e.message}`, 1);
  }
  // A single object is treated as a 1-item array; an array is used as-is (an empty
  // array yields an empty list, which the callers render as no output).
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  fail("Expected a JSON array (or object) on stdin.", 1);
}

function renderList(args) {
  const primaryTpl = args[0] || "";
  const secondaryTpl = args[1] || "";
  const iconTpl = args[2] || "";
  const badgeTpl = args[3] || "";

  const raw = readAllStdin();

  if (!primaryTpl) {
    fail("No --primary template provided. Use --primary <field-or-template>.", 2);
  }

  const records = parseRecords(raw);
  const width = process.stdout.columns || 80;

  const blocks = records.map(record => {
    const icon = resolve(iconTpl, record);
    const primary = resolve(primaryTpl, record);
    const secondary = secondaryTpl ? resolve(secondaryTpl, record) : "";
    const badge = badgeTpl ? resolve(badgeTpl, record) : "";

    const iconStr = icon ? `${icon} ` : "";

    // A list item's primary is a single line by design (like MUI's ListItemText,
    // which truncates with an ellipsis rather than wrapping). Truncate the plain
    // primary text to fit within the terminal width, reserving room for the icon
    // prefix and — when a badge is present — the badge plus a one-space gap.
    const reservedForBadge = badge ? badge.length + 1 : 0;
    const availableForPrimary = width - iconStr.length - reservedForBadge;
    const primaryFits = availableForPrimary <= 0 || primary.length <= availableForPrimary;
    const displayPrimary = primaryFits
      ? primary
      : primary.slice(0, Math.max(0, availableForPrimary - 1)) + "…";

    // Only the primary text is colored yellow; icon, secondary, and badge stay
    // uncolored. Layout uses the plain (uncolored) length. Trailing-whitespace
    // trimming is done on the plain text so it is not defeated by the reset code.
    const plainLeft = iconStr + displayPrimary;

    const lines = [];
    if (badge) {
      // The badge is right-aligned, so the primary sits mid-line; color it as-is.
      const gap = Math.max(1, width - plainLeft.length - badge.length);
      const coloredLeft = iconStr + (displayPrimary ? `${YELLOW}${displayPrimary}${RESET}` : displayPrimary);
      lines.push((coloredLeft + " ".repeat(gap) + badge).replace(/\s+$/, ""));
    } else {
      // Trim trailing whitespace first, then color the surviving primary text.
      const trimmedPrimary = displayPrimary.replace(/\s+$/, "");
      if (trimmedPrimary) {
        lines.push(iconStr + `${YELLOW}${trimmedPrimary}${RESET}`);
      } else {
        lines.push(iconStr.replace(/\s+$/, ""));
      }
    }
    if (secondary) {
      lines.push((" ".repeat(iconStr.length) + secondary).replace(/\s+$/, ""));
    }
    return lines.join("\n");
  });

  if (blocks.length > 0) {
    process.stdout.write(blocks.join("\n\n") + "\n");
  }
}

// Shared delegation to aux4 2table for both the `table` (ascii) and `csv` commands.
// `format` selects 2table's output: null/undefined -> ascii (2table's own default,
// no --format flag), "csv" -> passes --format csv. Everything else (JSON parsing,
// edge cases, the missing-2table error check) is identical, so the two commands
// share this one code path rather than duplicating it.
function delegateToTable(args, format) {
  const label = format === "csv" ? "csv" : "table";
  const table = args[0] || "";
  const lineNumbers = args[1] || "false";
  const showInvalidLines = args[2] || "false";

  const raw = readAllStdin();

  // Validate/normalize the JSON here so we give a clear error (exit 1) on invalid
  // input rather than relying on 2table, wrap a single object into a 1-item array,
  // and treat an empty array as a clean no-op (print nothing, exit 0) — 2table
  // itself errors on an empty array.
  const records = parseRecords(raw);
  if (records.length === 0) {
    process.exit(0);
  }
  const input = JSON.stringify(records);

  // Delegate to aux4 2table. For "csv" pass --format csv; for the ascii table
  // command pass no --format flag so 2table's own ascii default applies.
  const forwarded = ["2table"];
  if (format === "csv") forwarded.push("--format", "csv");
  forwarded.push("--lineNumbers", lineNumbers, "--showInvalidLines", showInvalidLines);
  if (table) forwarded.push(table);

  const result = spawnSync("aux4", forwarded, { input, encoding: "utf8" });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail(`aux4 was not found on PATH. Install aux4 to use 'aux4 render ${label}'.`, 5);
    }
    fail(`Failed to run aux4 2table: ${result.error.message}`, 5);
  }

  const stderr = result.stderr || "";
  if (result.status !== 0 && /command not found/i.test(stderr) && /2table/i.test(stderr)) {
    fail(`'aux4 render ${label}' requires the aux4/2table package. Install it with: aux4 aux4 pkger install aux4/2table`, 5);
  }

  if (stderr) process.stderr.write(stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.status === null ? 1 : result.status);
}

function renderKv(args) {
  const keyTpl = args[0] || "";
  const valueTpl = args[1] || "";

  const raw = readAllStdin();

  // Both --key and --value are required. They deliberately have a "" default in
  // package/.aux4 (so aux4 never prompts and eats the piped stdin); the check
  // lives here in the script, mirroring the --primary validation in list.
  if (!keyTpl) {
    fail("No --key field provided. Use --key <field>.", 2);
  }
  if (!valueTpl) {
    fail("No --value field provided. Use --value <field>.", 2);
  }

  const records = parseRecords(raw);

  // One "<resolvedKey>=<resolvedValue>" line per record (dotenv-style key=value).
  const lines = records.map(record => `${resolve(keyTpl, record)}=${resolve(valueTpl, record)}`);

  if (lines.length > 0) {
    process.stdout.write(lines.join("\n") + "\n");
  }
}

function main() {
  // A downstream consumer (e.g. `| head`) closing early is normal, not an error.
  process.stdout.on("error", e => {
    if (e.code === "EPIPE") process.exit(0);
    fail(`Failed to write output: ${e.message}`, 8);
  });

  const argv = process.argv.slice(2);
  const action = argv[0];
  const rest = argv.slice(1);

  if (action === "list") return renderList(rest);
  if (action === "table") return delegateToTable(rest);
  if (action === "csv") return delegateToTable(rest, "csv");
  if (action === "kv") return renderKv(rest);
  fail(`Invalid action: ${action}. Use "list", "table", "csv", or "kv".`, 2);
}

main();
