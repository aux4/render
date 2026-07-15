#!/usr/bin/env node

// aux4/render — render a JSON array from stdin as a human-readable list or table.
//
// This is a zero-dependency ESM script (Node builtins only), so it is authored
// directly here rather than bundled. Two actions:
//   list  <primary> <secondary> <icon> <actions>
//   table <table> <lineNumbers> <showInvalidLines>
//
// Field interpolation rule (shared by --icon/--primary/--secondary/--actions):
//   - No "$" in the value  -> the whole string is a bare field name (2table-style),
//                             e.g. --secondary date -> record.date
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

// Apply the field interpolation rule to a single template value.
function resolve(template, record) {
  if (template === undefined || template === null || template === "") return "";
  if (template.indexOf("$") === -1) {
    return stringify(getField(record, template.trim()));
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
    fail(`Invalid JSON on stdin: ${e.message}`, 3);
  }
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  fail("Expected a JSON array (or object) on stdin.", 3);
}

function renderList(args) {
  const primaryTpl = args[0] || "";
  const secondaryTpl = args[1] || "";
  const iconTpl = args[2] || "";
  const actionsTpl = args[3] || "";

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
    const actions = actionsTpl ? resolve(actionsTpl, record) : "";

    const iconStr = icon ? `${icon} ` : "";
    const left = iconStr + primary;

    const lines = [];
    if (actions) {
      const gap = Math.max(1, width - left.length - actions.length);
      lines.push((left + " ".repeat(gap) + actions).replace(/\s+$/, ""));
    } else {
      lines.push(left.replace(/\s+$/, ""));
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

function renderTable(args) {
  const table = args[0] || "";
  const lineNumbers = args[1] || "false";
  const showInvalidLines = args[2] || "false";

  const raw = readAllStdin();

  // Always render ascii — delegate to aux4 2table with no --format flag so 2table's
  // own ascii default applies.
  const forwarded = ["2table", "--lineNumbers", lineNumbers, "--showInvalidLines", showInvalidLines];
  if (table) forwarded.push(table);

  const result = spawnSync("aux4", forwarded, { input: raw, encoding: "utf8" });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail("aux4 was not found on PATH. Install aux4 to use 'aux4 render table'.", 5);
    }
    fail(`Failed to run aux4 2table: ${result.error.message}`, 5);
  }

  const stderr = result.stderr || "";
  if (result.status !== 0 && /command not found/i.test(stderr) && /2table/i.test(stderr)) {
    fail("'aux4 render table' requires the aux4/2table package. Install it with: aux4 aux4 pkger install aux4/2table", 5);
  }

  if (stderr) process.stderr.write(stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.status === null ? 1 : result.status);
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
  if (action === "table") return renderTable(rest);
  fail(`Invalid action: ${action}. Use "list" or "table".`, 2);
}

main();
