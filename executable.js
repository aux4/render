#!/usr/bin/env node

// aux4/render — render a JSON array from stdin as a human-readable view.
//
// This is the authored source. It is bundled (together with its npm dependency
// js-yaml) by rollup into the self-contained package/lib/aux4-render.mjs artifact
// that ships in the package and is executed by package/.aux4 — mirroring the build
// used by aux4/2table and aux4/template. Edit THIS file, then run `npm run build`.
// Five actions:
//   list  <primary> <secondary> <icon> <badge>
//   table <table> <lineNumbers> <showInvalidLines>
//   csv   <table> <lineNumbers> <showInvalidLines>
//   kv    [<structure>] [<index>]
//   yaml  [<structure>] [<index>]
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
import readline from "readline";
import yaml from "js-yaml";
// Vendored from aux4/2table — see lib/ValueFormatter.js. Powers the shared
// `{format:...}` value modifier for kv/yaml/list (table/csv pass it through to
// 2table). Rollup inlines this into the bundle (inlineDynamicImports is on).
import { ValueFormatterFactory } from "./lib/ValueFormatter.js";

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

// --- value-map + value-format resolution ----------------------------------
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
//   2) Value-format:  field{format:TYPE,option:value,...}
//        Render the record's `field` value through the shared ValueFormatter
//        (vendored from aux4/2table). Supported types: number, currency,
//        percent, date, time, datetime; option keys: decimals, currency
//        (ISO code, default USD), locale, and the unified temporal `style`
//        (short|medium|long|full) plus dateStyle/timeStyle overrides. Empty or
//        un-parseable values fall back to the raw value (never "NaN"/"Invalid
//        Date"). This REPLACES the old `field:transform` colon syntax — a bare
//        colon is no longer a transform (BREAKING CHANGE): use `field{format:...}`.
//
// Disambiguation is unambiguous: a value-map ALWAYS has brackets (`field[...]`);
// a value-format ALWAYS has braces (`field{...}`) with a `format:` key. Anything
// else falls through to the existing rules, so plain fields, literals (including
// ones that happen to contain a colon), and $-interpolation keep working exactly
// as before.

const FIELD_TOKEN = "[A-Za-z_][A-Za-z0-9_.]*";
const VALUE_MAP_RE = new RegExp(`^(${FIELD_TOKEN})\\[(.*)\\]$`);
const VALUE_FORMAT_RE = new RegExp(`^(${FIELD_TOKEN})\\{(.*)\\}$`);

// Parse a `{...}` modifier body into a format object, mirroring aux4/2table's
// Structure.js parseProperties: options are separated by `,` or `;`, `key:value`
// pairs, and numeric values (decimals) are coerced to integers. Commas inside the
// braces are the caller's responsibility to keep grouped (see the brace-depth
// tracking in splitKvItems and the VALUE_FORMAT_RE anchor).
function parseFormatProperties(propertiesStr) {
  const properties = {};
  if (!propertiesStr) return properties;
  propertiesStr
    .split(/[;,]/)
    .map(property => {
      const separatorIndex = property.indexOf(":");
      if (separatorIndex === -1) {
        return [property.trim(), undefined];
      }
      return [property.slice(0, separatorIndex).trim(), property.slice(separatorIndex + 1).trim()];
    })
    .forEach(([key, value]) => {
      if (key && value !== undefined) {
        if (value !== "" && !isNaN(value)) {
          properties[key] = parseInt(value, 10);
        } else {
          properties[key] = value;
        }
      }
    });
  return properties;
}

// Parse the body of a trailing `{...}` modifier into a format object, but only
// when it actually declares a `format:` type. A modifier without a `format` key
// (e.g. `{width:20}`) returns null so callers preserve their pre-format behavior
// (the modifier is accepted but ignored, matching the historical contract).
function parseFormatModifier(propertiesStr) {
  const props = parseFormatProperties(propertiesStr);
  return props.format !== undefined ? props : null;
}

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

// Apply the field resolution rules to a single template value. Order matters:
// value-map (brackets) first, then value-format (braces + a format: key), then
// the original bare-field / literal / $-interpolation behavior.
function resolve(template, record) {
  if (template === undefined || template === null || template === "") return "";

  const mapMatch = template.match(VALUE_MAP_RE);
  if (mapMatch) {
    return resolveValueMap(mapMatch[1], mapMatch[2], record);
  }

  const formatMatch = template.match(VALUE_FORMAT_RE);
  if (formatMatch) {
    const format = parseFormatModifier(formatMatch[2]);
    // Only a real `{format:...}` modifier renders through the formatter; a brace
    // body without a format type falls through to the rules below.
    if (format) {
      const formatted = ValueFormatterFactory.create(format).format(getField(record, formatMatch[1]));
      return stringify(formatted);
    }
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

// Parse stdin into an array of records, auto-detecting the input shape:
//   1) A single JSON document — a whole-buffer array (used as-is) or object
//      (wrapped into a 1-item array). This is the historical behavior and is
//      tried first so pretty-printed multi-line JSON keeps working.
//   2) NDJSON — one JSON value per line — used as the fallback when the whole
//      buffer is not a single valid JSON document. Blank/whitespace-only lines
//      are ignored; any non-blank line that fails to parse errors with its line
//      number (exit 1), matching the single-document invalid-JSON style.
function parseRecords(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  let value;
  try {
    value = JSON.parse(trimmed);
  } catch {
    // Not a single JSON document -> treat stdin as NDJSON (one object per line).
    return parseNdjson(raw);
  }
  // A single object is treated as a 1-item array; an array is used as-is (an empty
  // array yields an empty list, which the callers render as no output).
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  fail("Expected a JSON array (or object) on stdin.", 1);
}

// Parse an NDJSON buffer: one JSON value per line, blank lines skipped. A line
// that fails to parse is a hard error (exit 1) reported with its 1-based line
// number so the source of a malformed record is obvious.
function parseNdjson(raw) {
  const records = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const text = line.trim();
    if (text === "") return;
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      fail(`Invalid JSON on stdin (line ${i + 1}): ${e.message}`, 1);
    }
    records.push(value);
  });
  return records;
}

// Read stdin line-by-line and invoke `onRecord` for each parsed JSON value AS IT
// ARRIVES (never waiting for EOF), then `onClose` when the stream ends. This is
// the foundation of --inputStream: piping `tail -f log | aux4 render <cmd> --inputStream`
// renders each new line live. Blank lines are skipped; a line that fails to parse
// errors with its 1-based line number (exit 1), mirroring parseNdjson.
function followStream(onRecord, onClose) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let lineNo = 0;
  rl.on("line", line => {
    lineNo += 1;
    const text = line.trim();
    if (text === "") return;
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      fail(`Invalid JSON on stdin (line ${lineNo}): ${e.message}`, 1);
    }
    onRecord(value);
  });
  rl.on("close", () => {
    if (onClose) onClose();
  });
}

// Render a single list record into its block string (icon + primary line, plus an
// optional right-aligned badge and an indented secondary line). Shared by batch
// mode (records joined by a blank line) and --inputStream mode (one block per incoming
// record), so both produce byte-identical formatting.
function renderListBlock(record, cfg) {
  const { primaryTpl, secondaryTpl, iconTpl, badgeTpl, width } = cfg;
  const GUTTER = " ";

  const icon = resolve(iconTpl, record);
  const primary = resolve(primaryTpl, record);
  const secondary = secondaryTpl ? resolve(secondaryTpl, record) : "";
  const badge = badgeTpl ? resolve(badgeTpl, record) : "";

  const iconStr = icon ? `${icon} ` : "";

  // A list item's primary is a single line by design (like MUI's ListItemText,
  // which truncates with an ellipsis rather than wrapping). Truncate the plain
  // primary text to fit within the (gutter-adjusted) terminal width, reserving
  // room for the icon prefix and — when a badge is present — the badge plus a
  // one-space gap.
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
    // `gap` uses the gutter-adjusted width so the gutter + left + gap + badge
    // spans exactly the terminal width (badge flush to the right edge).
    const gap = Math.max(1, width - plainLeft.length - badge.length);
    const coloredLeft = iconStr + (displayPrimary ? `${YELLOW}${displayPrimary}${RESET}` : displayPrimary);
    lines.push((GUTTER + coloredLeft + " ".repeat(gap) + badge).replace(/\s+$/, ""));
  } else {
    // Trim trailing whitespace first, then color the surviving primary text.
    const trimmedPrimary = displayPrimary.replace(/\s+$/, "");
    if (trimmedPrimary) {
      lines.push(GUTTER + iconStr + `${YELLOW}${trimmedPrimary}${RESET}`);
    } else {
      lines.push((GUTTER + iconStr).replace(/\s+$/, ""));
    }
  }
  if (secondary) {
    lines.push((GUTTER + " ".repeat(iconStr.length) + secondary).replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

function renderList(args) {
  const primaryTpl = args[0] || "";
  const secondaryTpl = args[1] || "";
  const iconTpl = args[2] || "";
  const badgeTpl = args[3] || "";
  const inputStream = args[4] === "true";

  if (!primaryTpl) {
    fail("No --primary template provided. Use --primary <field-or-template>.", 2);
  }

  // Every emitted line starts with a single leading space (a left gutter) so list
  // output visually aligns with aux4/2table (and table/csv, which delegate to it) —
  // all of which render each line inside a one-column left gutter. The gutter
  // consumes one column, so ALL width math below (primary truncation and the
  // right-aligned badge) runs against the remaining content width (terminal - 1),
  // keeping the badge's right edge flush without overflowing by the extra column.
  const width = (process.stdout.columns || 80) - 1;
  const cfg = { primaryTpl, secondaryTpl, iconTpl, badgeTpl, width };

  // --inputStream: render each incoming record live (no cross-row coupling). Records
  // are separated by a blank line exactly as in batch mode; each block is flushed
  // as it arrives so `tail -f log | aux4 render list --inputStream` shows lines live.
  if (inputStream) {
    let first = true;
    followStream(record => {
      const block = renderListBlock(record, cfg);
      process.stdout.write((first ? "" : "\n") + block + "\n");
      first = false;
    });
    return;
  }

  const records = parseRecords(readAllStdin());
  const blocks = records.map(record => renderListBlock(record, cfg));
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
  const inputStream = args[3] === "true";

  // --inputStream can't use the whole-array spawnSync handoff to 2table (that waits for
  // EOF). Stream the rows in-process instead: csv prints a header then one line per
  // record; table freezes column widths from the header + first row and clamps
  // every later row to those widths. Non-follow behavior is unchanged.
  if (inputStream) {
    if (format === "csv") return followCsv(table);
    return followTable(table);
  }

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

// --- streaming (--inputStream) table + csv ------------------------------------
//
// Unlike the non-streaming path (which buffers the whole array and hands it to
// aux4/2table), --inputStream renders each record AS IT ARRIVES over a line-by-line
// stream. Column widths therefore cannot be computed from the full dataset, so
// the table renderer FREEZES each column's width from the header name plus the
// FIRST record's cells, then clamps every later row to that width (padding when
// short, truncating with a trailing "…" when long) so the columns stay aligned
// even under `tail -f`. An explicit `{width:N}` on a column always wins. Output
// matches 2table's borderless ascii style (no box), just streamed row-by-row.
//
// This is implemented in-process rather than by adding a streaming mode to
// aux4/2table: 2table's AsciiRenderer is built around a two-pass, whole-dataset
// width calculation and a full Table cell model, which is fundamentally at odds
// with freeze-from-first-row streaming. A small self-contained renderer here
// is cleaner than bolting an incompatible streaming path onto 2table, and keeps
// the non-streaming delegation (the common case) untouched.

// Turn the optional structure string into an ordered list of columns
// ({ label, path, format, width }). With no structure, derive columns from the
// first record's own top-level keys (the streaming analogue of auto-structure).
function buildFollowColumns(leaves, firstRecord) {
  if (leaves) {
    return leaves.map(leaf => ({ label: leaf.key, path: leaf.path, format: leaf.format, width: leaf.width }));
  }
  const keys = firstRecord && typeof firstRecord === "object" && !Array.isArray(firstRecord) ? Object.keys(firstRecord) : [];
  return keys.map(key => ({ label: key, path: key, format: null, width: null }));
}

// Resolve a column's display text for a record: read the field (dot-notation
// aware), apply a `{format:...}` modifier when present, then stringify.
function cellText(record, col) {
  const value = getField(record, col.path);
  if (col.format) {
    return stringify(ValueFormatterFactory.create(col.format).format(value));
  }
  return stringify(value);
}

// Truncate text to at most `width` display columns, appending a trailing "…"
// when it overflows ("…" is one display column, so the result never exceeds
// `width`). Padding to width is handled separately by padCell.
function truncCell(text, width) {
  if (text.length > width) {
    return text.slice(0, Math.max(0, width - 1)) + "…";
  }
  return text;
}

// Right-pad to `width` display columns (no-op when already at/over width).
function padCell(text, width) {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

// Assemble one borderless line in aux4/2table's ascii style: a single leading
// space, each cell truncated to its frozen width, columns separated by two
// spaces. Every column but the LAST is right-padded to its frozen width; the
// last is left unpadded so lines carry no trailing whitespace (matching 2table).
function followLine(cells, cols, colorize) {
  const last = cells.length - 1;
  const parts = cells.map((cell, i) => {
    const text = i < last ? padCell(truncCell(cell, cols[i].frozen), cols[i].frozen) : truncCell(cell, cols[i].frozen);
    return colorize ? YELLOW + text + RESET : text;
  });
  return " " + parts.join("  ");
}

// A data row and the header row, in the borderless style above.
function dataRow(record, cols) {
  return followLine(cols.map(col => cellText(record, col)), cols, false);
}

function headerRow(cols) {
  return followLine(cols.map(col => col.label), cols, true);
}

// Freeze each column's width from the header label and the first record's cell,
// unless the column declared an explicit `{width:N}` (which always wins).
function freezeWidths(cols, firstRecord) {
  for (const col of cols) {
    if (typeof col.width === "number") {
      col.frozen = Math.max(1, col.width);
    } else {
      col.frozen = Math.max(1, col.label.length, cellText(firstRecord, col).length);
    }
  }
}

function parseStructureLeaves(structure) {
  if (structure === "") return null;
  try {
    return collectKvLeaves(splitKvItems(structure), "");
  } catch (e) {
    fail(`Invalid structure: ${e.message}`, 2);
  }
}

function followTable(table) {
  const leaves = parseStructureLeaves((table || "").trim());
  let cols = null;
  let started = false;

  followStream(
    record => {
      if (!started) {
        cols = buildFollowColumns(leaves, record);
        freezeWidths(cols, record);
        // Emit the header + first data row immediately; borderless like 2table.
        process.stdout.write(headerRow(cols) + "\n");
        process.stdout.write(dataRow(record, cols) + "\n");
        started = true;
      } else {
        process.stdout.write(dataRow(record, cols) + "\n");
      }
    },
    () => {}
  );
}

// RFC 4180 field: quote when it contains a comma, double quote, CR or LF, doubling
// any embedded quotes (mirrors aux4/2table's CsvRenderer for the streaming case).
function csvField(text) {
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function followCsv(table) {
  const leaves = parseStructureLeaves((table || "").trim());
  let cols = null;

  followStream(record => {
    if (!cols) {
      cols = buildFollowColumns(leaves, record);
      process.stdout.write(cols.map(col => csvField(col.label)).join(",") + "\n");
    }
    process.stdout.write(cols.map(col => csvField(cellText(record, col))).join(",") + "\n");
  });
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

// Split a structure string on top-level commas. Commas inside [...] (nested
// groups) OR inside {...} (a `{format:currency,currency:USD}` modifier) stay
// grouped — brace-depth tracking mirrors aux4/2table's Structure.js parseItems so
// a multi-option format modifier is never split apart on its inner comma.
function splitKvItems(str) {
  const items = [];
  let current = "";
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    if (ch === "," && bracketDepth === 0 && braceDepth === 0) {
      if (current.trim()) items.push(parseKvItem(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(parseKvItem(current.trim()));
  return items;
}

// Parse a single structure item into { field, label, group, format }. `label` is
// null unless the item was renamed with `field:Label` (surrounding double quotes
// are stripped, matching 2table's own header rendering). `format` is null unless
// the item carries a trailing `{format:...}` modifier — parsed into a format
// object routed through the shared ValueFormatter. A trailing modifier WITHOUT a
// `format:` key (e.g. `{width:20}`) is still accepted but ignored (format = null),
// preserving the historical "paste a table structure unchanged" contract.
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
      remaining = remaining.substring(end + 1);
    }
  }

  // Capture a trailing `{...}` modifier. A body declaring a `format:` type
  // produces a format object; a `width:N` option (used by `render table --inputStream`
  // to freeze an explicit column width) is captured separately. Other options are
  // accepted but ignored, preserving the "paste a table structure unchanged"
  // contract.
  let format = null;
  let width = null;
  if (remaining.startsWith("{")) {
    const propsEnd = remaining.indexOf("}");
    if (propsEnd !== -1) {
      const body = remaining.substring(1, propsEnd);
      format = parseFormatModifier(body);
      const props = parseFormatProperties(body);
      if (typeof props.width === "number") width = props.width;
    }
  }

  return { field, label, group, format, width };
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
      leaves.push({ key: item.label != null ? item.label : path, path, format: item.format, width: item.width });
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
      // A `{format:...}` leaf renders its value through the shared formatter
      // (before stringify) and is emitted as a single formatted pair — array
      // index-flattening is skipped so `amount{format:currency}` is one line.
      if (leaf.format) {
        const formatted = ValueFormatterFactory.create(leaf.format).format(value);
        out.push({ key, value: stringify(formatted) });
      } else if (Array.isArray(value)) {
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

// Apply an optional --index N selection to the parsed records. Shared by `kv` and
// `yaml`. An empty/unset value means "process every record". A non-integer or
// out-of-range value is a hard error (exit 1), matching the invalid-JSON
// convention for bad input. The selected record is returned as a 1-item array so
// downstream code treats it exactly like the existing single-record case.
function selectIndex(records, indexArg) {
  if (indexArg === "") return records;
  const n = Number(indexArg);
  if (!Number.isInteger(n)) {
    fail(`Invalid --index "${indexArg}": expected a non-negative integer.`, 1);
  }
  if (n < 0 || n >= records.length) {
    fail(`--index ${n} is out of range: ${records.length} record(s) available.`, 1);
  }
  return [records[n]];
}

function renderKv(args) {
  const structure = (args[0] || "").trim();
  const indexArg = (args[1] || "").trim();

  const raw = readAllStdin();
  let records = parseRecords(raw);

  // Optional --index N selects a single record (0-based) from the top-level array
  // before anything else runs (see selectIndex).
  records = selectIndex(records, indexArg);

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

// --- yaml -----------------------------------------------------------------
//
// `render yaml` shares the exact same structure grammar as `render kv`
// (splitKvItems/parseKvItem: comma-separated fields, `field[sub1,sub2]` nesting,
// `field:"Label"` rename) — but instead of FLATTENING the selection into dotted
// key=value lines, it builds a nested plain object that mirrors the selected
// structure and serializes it as YAML. So `address[street,city]` produces a
// nested `address:` mapping with `street`/`city` under it, not flat
// `address.street`/`address.city` keys.

// Build a nested plain object from `record` selecting only the fields named by the
// parsed structure `items`. Nesting is PRESERVED (not flattened): a `field[...]`
// group becomes a nested sub-object (or, when the field holds an array, an array of
// sub-objects) whose keys are just the group's own selected fields. A `field:"Label"`
// rename changes the emitted key. A selected field that is missing on the record is
// emitted as null so the key still appears.
function buildSelectedObject(record, items) {
  const result = {};
  for (const item of items) {
    const key = item.label != null ? item.label : item.field;
    const value = getField(record, item.field);
    if (item.group && item.group.length > 0) {
      if (Array.isArray(value)) {
        result[key] = value.map(element =>
          element !== null && typeof element === "object"
            ? buildSelectedObject(element, item.group)
            : element
        );
      } else if (value !== null && value !== undefined && typeof value === "object") {
        result[key] = buildSelectedObject(value, item.group);
      } else {
        // The selected field isn't an object/array to descend into; keep its raw
        // value (null when missing) so the nested selection at least surfaces it.
        result[key] = value === undefined ? null : value;
      }
    } else if (item.format) {
      // A `{format:...}` leaf becomes its formatted display string (turning a
      // typed value into a string is expected); missing/un-parseable values fall
      // back per the formatter's contract (empty string / raw value).
      const formatted = ValueFormatterFactory.create(item.format).format(value === undefined ? "" : value);
      result[key] = stringify(formatted);
    } else {
      // No format modifier: preserve the original typed value and nesting exactly.
      result[key] = value === undefined ? null : value;
    }
  }
  return result;
}

function renderYaml(args) {
  const structure = (args[0] || "").trim();
  const indexArg = (args[1] || "").trim();

  const raw = readAllStdin();
  let records = parseRecords(raw);

  // Optional --index N selects a single record before serialization (shared with kv).
  records = selectIndex(records, indexArg);

  // An empty array yields no output (exit 0), matching list/table/csv/kv.
  if (records.length === 0) {
    process.exit(0);
  }

  // With a structure, build a nested object per record selecting just those fields;
  // without one, use the full original record as-is (YAML represents nesting natively,
  // so there is nothing to flatten in the no-structure case).
  let items = null;
  if (structure !== "") {
    try {
      items = splitKvItems(structure);
    } catch (e) {
      fail(`Invalid structure: ${e.message}`, 2);
    }
  }
  const objects = records.map(record => (items ? buildSelectedObject(record, items) : record));

  // A single record (a lone object, a one-element array, or the result of --index N)
  // dumps as a single YAML mapping; multiple records dump as a YAML sequence.
  const output = objects.length === 1 ? objects[0] : objects;

  // lineWidth: -1 disables line folding so long scalar values are not wrapped;
  // noRefs disables anchors/aliases for repeated objects (readable, self-contained).
  process.stdout.write(yaml.dump(output, { lineWidth: -1, noRefs: true }));
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
  if (action === "yaml") return renderYaml(rest);
  fail(`Invalid action: ${action}. Use "list", "table", "csv", "kv", or "yaml".`, 2);
}

main();
