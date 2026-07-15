#!/usr/bin/env node

// aux4/render — render a JSON array from stdin as a human-readable list or table.
//
// This is a zero-dependency ESM script (Node builtins only), so it is authored
// directly here rather than bundled. Four actions:
//   list  <primary> <secondary> <icon> <badge>
//   table <table> <lineNumbers> <showInvalidLines>
//   csv   <table> <lineNumbers> <showInvalidLines>
//   kv    [<structure>] [<index>]
//
// Field interpolation rule (shared by --icon/--primary/--secondary/--badge):
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

// --- value-map + named-transform resolution ------------------------------
//
// On top of the bare-field / literal / $-interpolation rules (see resolve),
// --icon/--primary/--secondary/--badge also accept two per-field forms:
//
//   1) Value-map:  field[VALUE:label,VALUE2:label2,...]
//        Look up the record's `field`, map ITS value through the bracketed
//        table. An unmapped value falls back to the raw field value unchanged
//        (never blank, never error). The bracket grammar reuses the exact same
//        comma/colon parser built for `render kv` (splitKvItems/parseKvItem).
//
//   2) Named transform:  field:transformName
//        Apply a built-in transform to the record's `field` value. Supported:
//        case, date, time, datetime, number (see applyTransform). A value that
//        cannot be parsed for the requested transform falls back to the raw
//        field value unchanged (same "always show something" philosophy).
//
// Disambiguation is unambiguous: a value-map ALWAYS has brackets (`field[...]`);
// a named transform NEVER has brackets, just one bare colon before a KNOWN
// transform name. Anything else falls through to the existing rules, so plain
// fields, literals (including ones that happen to contain a colon), and
// $-interpolation keep working exactly as before.

const FIELD_TOKEN = "[A-Za-z_][A-Za-z0-9_.]*";
const VALUE_MAP_RE = new RegExp(`^(${FIELD_TOKEN})\\[(.*)\\]$`);
const TRANSFORM_RE = new RegExp(`^(${FIELD_TOKEN}):(case|date|time|datetime|number)$`);

// Build a value-map lookup from the bracket contents, reusing the kv grammar so
// `field[A:x,B:y]` parses identically to `render kv`'s `field[A:x,B:y]` renames.
function resolveValueMap(field, content, record) {
  const rawValue = stringify(getField(record, field));
  let items;
  try {
    items = splitKvItems(content);
  } catch {
    // Malformed map contents: fall back to the raw field value unchanged.
    return rawValue;
  }
  const map = new Map();
  for (const item of items) {
    map.set(item.field, item.label != null ? item.label : item.field);
  }
  return map.has(rawValue) ? map.get(rawValue) : rawValue;
}

// snake_case / SCREAMING_SNAKE_CASE (and space-separated) -> Title Case words.
function toTitleCase(str) {
  return str
    .split(/[_\s]+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Parse a value into a Date. A number (or all-digit string) is treated as epoch
// millis; anything else is handed to the Date constructor (assumed ISO 8601 with
// a Z suffix or explicit offset). Returns null when the result is not a valid
// date, so callers can fall back to the raw value.
function parseTimestamp(value) {
  let date;
  if (typeof value === "number") {
    date = new Date(value);
  } else {
    const str = String(value).trim();
    if (str === "") return null;
    date = /^-?\d+$/.test(str) ? new Date(Number(str)) : new Date(str);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

// Apply a named transform to a raw field value. Timezone-sensitive transforms
// (date/time/datetime) convert from the timestamp's absolute instant to the Node
// runtime's default timezone via toLocale* with an undefined locale — the local
// machine's timezone/locale, never a hardcoded one. Any value that cannot be
// parsed for the transform is returned as its raw string unchanged.
function applyTransform(rawValue, name) {
  const str = stringify(rawValue);
  if (name === "case") {
    return str === "" ? "" : toTitleCase(str);
  }
  if (name === "number") {
    const n = typeof rawValue === "number" ? rawValue : Number(str);
    if (str.trim() === "" || Number.isNaN(n)) return str;
    return n.toLocaleString();
  }
  const date = parseTimestamp(rawValue);
  if (date === null) return str;
  if (name === "date") {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  if (name === "time") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  // datetime
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Apply the field resolution rules to a single template value. Order matters:
// value-map (brackets) first, then named transform (bare colon + known name),
// then the original bare-field / literal / $-interpolation behavior.
function resolve(template, record) {
  if (template === undefined || template === null || template === "") return "";

  const mapMatch = template.match(VALUE_MAP_RE);
  if (mapMatch) {
    return resolveValueMap(mapMatch[1], mapMatch[2], record);
  }

  const transformMatch = template.match(TRANSFORM_RE);
  if (transformMatch) {
    return applyTransform(getField(record, transformMatch[1]), transformMatch[2]);
  }

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

// --- kv structure parser -------------------------------------------------
//
// `render kv` accepts an optional structure argument using the SAME grammar as
// `render table`/`render csv`/`aux4 2table`: comma-separated fields, `field[a,b]`
// nesting, and `field:"Label"` (or `field:Label`) renaming. This is a small,
// self-contained parser that mirrors aux4/2table's lib/Structure.js grammar so
// the two stay in sync — kv's output shape (flat key=value lines) is not one of
// 2table's renderers, so we implement the grammar here rather than shelling out.
// Column-width modifiers like `{width:N}` are accepted but silently ignored,
// since a user may paste a structure they also use with `table`/`csv`.

// Split a structure string on top-level commas (commas inside [...] stay grouped).
function splitKvItems(str) {
  const items = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      if (current.trim()) items.push(parseKvItem(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(parseKvItem(current.trim()));
  return items;
}

// Parse a single structure item into { field, label, group }. `label` is null
// unless the item was renamed with `field:Label`; surrounding double quotes are
// stripped from the label (matching 2table's own header rendering).
function parseKvItem(item) {
  const fieldMatch = item.match(/^([^:[\]{]+)/);
  if (!fieldMatch) {
    throw new Error(`invalid structure item: ${item}`);
  }
  const field = fieldMatch[1].trim();

  const labelMatch = item.match(/^[^:[\]{]+:([^[\]{]+)/);
  let label = null;
  let consumed = fieldMatch[1];
  if (labelMatch) {
    consumed = `${fieldMatch[1]}:${labelMatch[1]}`;
    label = labelMatch[1].trim();
    if (label.startsWith('"') && label.endsWith('"')) {
      label = label.slice(1, -1);
    }
  }

  let remaining = item.substring(consumed.length);
  let group = null;
  if (remaining.startsWith("[")) {
    let count = 0;
    let end = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === "[") count++;
      else if (remaining[i] === "]") {
        count--;
        if (count === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      group = splitKvItems(remaining.substring(1, end));
    }
  }
  // Any trailing `{...}` (e.g. {width:20}) is intentionally ignored.

  return { field, label, group };
}

// Flatten a parsed structure into an ordered list of { key, path } leaves.
// The data path is always the dotted chain of field names (address.street). The
// emitted key is that dotted path UNLESS the leaf was explicitly renamed, in
// which case the label replaces the whole key (address[street:"Street Addr"]
// -> key "Street Addr", path "address.street").
function collectKvLeaves(items, parentPath) {
  const leaves = [];
  for (const item of items) {
    const path = parentPath ? `${parentPath}.${item.field}` : item.field;
    if (item.group && item.group.length > 0) {
      leaves.push(...collectKvLeaves(item.group, path));
    } else {
      leaves.push({ key: item.label != null ? item.label : path, path });
    }
  }
  return leaves;
}

// Recursively flatten any value into ordered { key, value } pairs under `path`.
// The rule is uniform for every level of nesting:
//   - Plain non-empty object -> recurse into each field, producing dotted keys
//     (address.street=...).
//   - Non-empty array -> recurse into each element using its INDEX as the next
//     path segment (tags.0=a, tags.1=b; arrays of arrays -> matrix.0.0=1). This
//     is the same treatment an object gets — an array's "keys" are just its
//     numeric indices.
//   - Everything else (primitive, null, empty object, empty array) is a leaf,
//     emitted as a single stringify'd value (empty object -> {}, empty array
//     -> [], so the key never silently disappears).
// The root single-item exception (a lone record gets no index prefix) is handled
// by the caller in renderKv, not here — this helper always indexes arrays.
function flatten(value, path, out) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ key: path, value: "[]" });
      return;
    }
    value.forEach((element, i) => {
      flatten(element, path ? `${path}.${i}` : String(i), out);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out.push({ key: path, value: "{}" });
      return;
    }
    for (const key of keys) {
      flatten(value[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  out.push({ key: path, value: stringify(value) });
}

// Build the { key, value } pairs for a single record under `basePrefix` (""
// for a lone record, "N" when the root array has multiple records). With an
// explicit structure each selected leaf is emitted directly; a leaf that
// resolves to an array is expanded into indexed keys (tags.0=a), while a bare
// object leaf keeps its whole-object JSON value (use brackets to expand it).
// With no structure the whole record is flattened recursively.
function recordPairs(record, basePrefix, leaves) {
  const out = [];
  if (leaves) {
    for (const leaf of leaves) {
      const key = basePrefix ? `${basePrefix}.${leaf.key}` : leaf.key;
      const value = getField(record, leaf.path);
      if (Array.isArray(value)) {
        flatten(value, key, out);
      } else {
        out.push({ key, value: stringify(value) });
      }
    }
  } else {
    flatten(record, basePrefix, out);
  }
  return out;
}

function renderKv(args) {
  const structure = (args[0] || "").trim();
  const indexArg = (args[1] || "").trim();

  const raw = readAllStdin();
  let records = parseRecords(raw);

  // Optional --index N selects a single record (0-based) from the top-level
  // array before anything else runs. An empty/unset value means "process every
  // record". A non-integer or out-of-range value is a hard error (exit 1),
  // matching the invalid-JSON convention for bad input.
  if (indexArg !== "") {
    const n = Number(indexArg);
    if (!Number.isInteger(n)) {
      fail(`Invalid --index "${indexArg}": expected a non-negative integer.`, 1);
    }
    if (n < 0 || n >= records.length) {
      fail(`--index ${n} is out of range: ${records.length} record(s) available.`, 1);
    }
    records = [records[n]];
  }

  // When a structure is given, resolve it once into an ordered list of leaves;
  // otherwise each record is auto-flattened into all of its (dotted) fields.
  let leaves = null;
  if (structure !== "") {
    try {
      leaves = collectKvLeaves(splitKvItems(structure), "");
    } catch (e) {
      fail(`Invalid structure: ${e.message}`, 2);
    }
  }

  // Root single-item exception (RENDER-006): a lone record — whether the input
  // was a single object, a one-element array, or the result of --index N — is
  // THE record and gets no index prefix. Multiple records each get an "N."
  // prefix so record boundaries stay unambiguous.
  const single = records.length === 1;
  const lines = [];
  records.forEach((record, i) => {
    const basePrefix = single ? "" : String(i);
    for (const pair of recordPairs(record, basePrefix, leaves)) {
      lines.push(`${pair.key}=${pair.value}`);
    }
  });

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
