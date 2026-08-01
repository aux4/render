# aux4/render

Render a JSON array from standard input as a human-readable view. Pipe the raw JSON output of any aux4 command through `aux4 render` to get a tidy list or table in the terminal.

`aux4/render` provides five commands:

- `aux4 render list` — an MUI-List-style view (icon, primary, secondary, and a right-aligned badge label).
- `aux4 render table` — a table view that delegates to [`aux4/2table`](https://github.com/aux4/2table).
- `aux4 render csv` — a CSV view that delegates to [`aux4/2table`](https://github.com/aux4/2table).
- `aux4 render kv` — a flat `key=value` (dotenv-style) view that flattens each record's fields, using the same structure grammar as `render table`/`csv`.
- `aux4 render yaml` — a YAML view that preserves nesting, using the same structure grammar as `render kv` (but keeps the selection nested instead of flattening it).

## Installation

```bash
aux4 aux4 pkger install aux4/render
```

## System Dependencies

This package runs on Node.js. If it is not already available, the installer can provision it:

- [brew](/r/public/packages/aux4/system-installer-brew)
- [linux](/r/public/packages/aux4/system-installer-linux)

The `render table` and `render csv` commands delegate to `aux4 2table`, which is declared as a package dependency and installed automatically.

## Quick Start

Given a JSON array on standard input, render it as a list:

```bash
cat people.json | aux4 render list --primary '$firstName $lastName' --secondary role --badge status
```

```text
 Ada Lovelace                                                             active
 Engineer

 Linus Torvalds                                                             away
 Maintainer
```

Or as a table:

```bash
cat people.json | aux4 render table firstName,lastName,role
```

```text
 firstName  lastName  role
 Ada        Lovelace  Engineer
 Linus      Torvalds  Maintainer
```

## Using it as a command's `render`

The main reason `aux4/render` exists is to be the [`render`](https://docs.aux4.io/render) of another `.aux4` command. A command captures raw JSON into its response (with a `json:` executor), and its `render` field pipes that response through `aux4 render` **only when the output goes to a terminal** — a piped or redirected run still gets the raw JSON untouched, so scripts keep structured data.

```json
{
  "profiles": [
    {
      "name": "main",
      "commands": [
        {
          "name": "servers",
          "execute": [
            "json:curl -s https://api.example.com/servers"
          ],
          "render": {
            "tty": "aux4 render list --primary name --icon 'status[ONLINE:🟢,OFFLINE:🔴]' --secondary region --badge status",
            "table": "aux4 render table name,region,status"
          },
          "help": {
            "text": "list the servers"
          }
        }
      ]
    }
  ]
}
```

- `aux4 servers` in a terminal renders the list — the `tty` entry runs automatically.
- `aux4 servers --render table` selects the `table` format explicitly.
- `aux4 servers | jq .` (piped, not a TTY) skips rendering and emits the raw JSON.

The execute step must **capture** its output into the response — use a `json:` or `nout:` executor. (On aux4 `5.1.31`+ a bare shell command works too: the core auto-silences the execute step whenever a `render` field is present, so the raw output isn't printed alongside the rendered view.) See the [Render documentation](https://docs.aux4.io/render) for the full mechanics of the `render` field, `--render <name>` selection, and TTY auto-detection.

## Field interpolation

Every `render list` template flag (`--icon`, `--primary`, `--secondary`, `--badge`) is resolved against the current record. The forms below are tried in order — a value-map (brackets) first, then a named transform (bare colon), then the base bare-field / literal / `$`-interpolation rules:

- **Value-map — `field[VALUE:label,VALUE2:label2,...]`** — look up the record's `field`, then map **its value** through the bracketed table. `--icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'` shows a per-status emoji; `--secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'` shows a friendly label. When the record's value is **not** a key in the map, the raw field value is shown unchanged (never blank, never an error). The bracket grammar is the same comma/colon grammar used by `render kv` (`VALUE:label` pairs, optionally quoted labels).
- **Value-format — `field{format:TYPE,option:value,...}`** — render the record's `field` value through the shared value formatter (see [Value formatting](#value-formatting) below). `--badge 'price{format:currency,currency:USD}'` shows `$1,234.50`; `--secondary 'createdAt{format:datetime}'` shows a localized date+time. Empty or un-parseable values fall back to the raw value (never `NaN`/`Invalid Date`).

  > **Breaking change (`render list`):** the old `field:transform` colon syntax (`field:number`, `field:date`, `field:case`, …) has been **removed**. A bare colon is no longer a transform — use `field{format:...}` instead. There is no replacement for the old `case` transform.
- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style). `--secondary date` renders `record.date`. Dot notation works for nested fields: `--secondary address.city`. If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when missing) and the rest of the string is kept literal. `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps them clear of aux4's own execute-line `${...}` substitution. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally. A value-map always has brackets and a value-format always has braces (`{format:...}`), so a plain literal (even one containing a colon) is never mistaken for either.

## Value formatting

Every render command supports a per-field `{format:...}` modifier that renders a raw value as a formatted display string. The formatter is **vendored from [`aux4/2table`](https://github.com/aux4/2table)** (`lib/ValueFormatter.js`) so `render` and `2table` format values identically; for `render table` / `render csv` the modifier is forwarded straight through to `aux4 2table`, which does the formatting.

Grammar: `field{format:TYPE,option:value,option:value}`. Options may be separated by `,` or `;`. Commas inside the braces stay grouped, so a multi-option modifier is never split apart from the rest of the structure.

Format types:

| Type | Renders | Example (`locale:en-US`) |
|------|---------|--------------------------|
| `number` | Grouped number | `1234567.89` → `1,234,567.89` |
| `currency` | Currency (ISO code, default `USD`) | `1234.5` → `$1,234.50` |
| `percent` | Percentage (value treated as a **ratio**) | `0.1234` + `decimals:2` → `12.34%` |
| `date` | Localized date | `1990-05-01` → `May 1, 1990` |
| `time` | Localized time | `2026-07-15T02:30:00Z` → `2:30:00 AM` (UTC) |
| `datetime` | Localized date + time | `2026-07-15T02:30:00Z` → `Jul 15, 2026, 2:30 AM` (UTC) |

Option keys:

- `decimals` — fixed fraction digits (`number`, `currency`, `percent`).
- `currency` — ISO currency code for `currency` (default `USD`).
- `locale` — BCP 47 locale (e.g. `en-US`). Defaults to the host locale.
- `style` — unified temporal style: `short | medium | long | full`. Sets the date style for `date`, the time style for `time`, and **both** for `datetime`.
- `dateStyle` / `timeStyle` — per-part overrides. Precedence per part: explicit part style > `style` > built-in default (`date` medium, `time` medium, `datetime` = date medium + time short).

Empty values render as an empty string; values that cannot be parsed for the requested type fall back to the raw value unchanged — never `NaN` or `Invalid Date`.

Per-command usage:

- **`render kv`** — `field{format:...}` in the structure formats the emitted value: `aux4 render kv 'name,price{format:currency,currency:USD}'` → `price=$1,234.50`.
- **`render yaml`** — a formatted leaf becomes a display **string** (formatting intentionally turns a typed value into a string); unformatted fields keep their original type and nesting.
- **`render list`** — any template flag accepts `field{format:...}`: `aux4 render list --primary name --badge 'price{format:currency}'`.
- **`render table` / `render csv`** — the modifier is passed through verbatim to `aux4 2table`, so `aux4 render table 'name,price{format:currency,currency:USD}'` renders a formatted column. Requires a current `aux4/2table` that supports `{format:...}`.

```bash
echo '[{"name":"Widget","price":1234.5,"rate":0.2,"ts":"2026-07-15T02:30:00Z"}]' \
  | aux4 render kv 'name,price{format:currency,currency:USD,locale:en-US},rate{format:percent,decimals:0,locale:en-US},ts{format:datetime,style:short,locale:en-US}'
```

```text
name=Widget
price=$1,234.50
rate=20%
ts=7/15/26, 2:30 AM
```

## Input handling

All render commands read JSON from standard input and handle these cases consistently:

- **JSON array** — rendered as usual, one row per element.
- **A single JSON object** (not wrapped in an array) — treated as a one-item array and rendered normally.
- **NDJSON** (one JSON object per line) — auto-detected when stdin is not a single JSON document. Each non-blank line is parsed as one record; blank/whitespace-only lines are ignored. A line that fails to parse prints a clear error with its 1-based line number to stderr and exits `1`.
- **An empty array (`[]`)** — a clean no-op: nothing is printed and the command exits `0`.
- **Invalid / non-JSON input** — the command prints a clear error to stderr and exits `1`.

Detection is automatic: the whole buffer is tried as a single JSON document first (so pretty-printed multi-line JSON keeps working), and only when that fails is the input read line-by-line as NDJSON.

```bash
printf '{"name":"Alice"}\n{"name":"Bob"}\n' | aux4 render list --primary name
```

```text
 Alice

 Bob
```

## Streaming with `--inputStream`

`render list`, `render csv`, and `render table` accept a `--inputStream` flag that reads stdin **line-by-line** (NDJSON) and renders each record **as it arrives**, never waiting for EOF. This makes `render` a live viewer for an append-only NDJSON stream:

```bash
tail -f events.ndjson | aux4 render list --inputStream --primary title --secondary message
```

- **`render list --inputStream`** — each record is an independent block, printed live with the same formatting as batch mode.
- **`render csv --inputStream`** — prints the header row once (from the `--table` structure, or the first record's keys), then one RFC 4180 CSV line per record. Rendered **in-process** (does not delegate to `aux4 2table`).
- **`render table --inputStream`** — prints an aligned table live in 2table's borderless ascii style (no box). Because rows arrive one at a time, column widths are **frozen from the header names plus the first record**; every later row is clamped to those widths — padded when short, or **truncated with a trailing `…`** when longer — so the columns stay aligned. An explicit `field{width:N}` always wins. Rendered **in-process** (does not delegate to `aux4 2table`).

```bash
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob","city":"SanFranciscoBayArea"}\n' \
  | aux4 render table name,city --inputStream
```

```text
 name  city
 Ada   NYC
 Bob   San…
```

Without `--inputStream`, all commands still accept NDJSON but buffer the whole stream first (the non-streaming `render table`/`render csv` continue to delegate to `aux4 2table` for their exact batch layout).

## Commands

### aux4 render list

Reads a JSON array from stdin and prints one block per record.

Options:

- `--primary <template>` — Primary line (required). Bare field name or `$field` interpolation. A list item's primary is a single line: when it is too long to fit the terminal width (accounting for the icon prefix and the badge, if present), it is truncated with a trailing `…` rather than wrapping.
- `--secondary <template>` — Secondary line, printed beneath the primary and indented to align under it.
- `--icon <template>` — Rendered before the primary line.
- `--badge <template>` — Right-aligned on the primary line to the terminal width (80 columns when not a TTY, e.g. in a pipe). Plain text, not interactive.
- `--inputStream <true|false>` — Stream stdin line-by-line (NDJSON) and render each record live as it arrives, never waiting for EOF (default: false). See [Streaming with `--inputStream`](#streaming-with---inputstream).

Records are separated by a blank line. In a real terminal the primary text is printed in yellow to stand out; the icon, secondary, and badge stay uncolored. The plain-text examples below do not show the color.

Input (`people.json`):

```json
[
  { "firstName": "Ada", "lastName": "Lovelace", "role": "Engineer", "status": "active" },
  { "firstName": "Linus", "lastName": "Torvalds", "role": "Maintainer", "status": "away" }
]
```

```bash
cat people.json | aux4 render list --primary '$firstName $lastName' --secondary role --badge status
```

```text
 Ada Lovelace                                                             active
 Engineer

 Linus Torvalds                                                             away
 Maintainer
```

Per-row icon from a field:

```bash
cat people.json | aux4 render list --icon emoji --primary '$firstName $lastName'
```

Literal icon on every row (no `emoji` field exists, so the value is used as-is):

```bash
cat people.json | aux4 render list --icon 😀 --primary '$firstName $lastName'
```

Status-driven icon and label with a value-map, plus a formatted timestamp badge:

```bash
echo '[{"title":"Ship release","status":"IN_PROGRESS","createdAt":"2026-07-15T14:30:00Z"}]' \
  | aux4 render list \
      --primary title \
      --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]' \
      --secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]' \
      --badge 'createdAt{format:datetime,locale:en-US}'
```

```text
 🔧 Ship release                                          Jul 15, 2026, 10:30 AM
    In Progress
```

An unmapped value falls back to the raw field value (`BLOCKED` has no entry in the map):

```bash
echo '[{"title":"Investigate outage","status":"BLOCKED"}]' \
  | aux4 render list --primary title --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'
```

```text
 BLOCKED Investigate outage
```

Value formatting — format a count as currency (see [Value formatting](#value-formatting)):

```bash
echo '[{"name":"Widgets","total":12000}]' \
  | aux4 render list --primary name --badge 'total{format:currency,currency:USD,locale:en-US}'
```

```text
 Widgets                                                              $12,000.00
```

### aux4 render kv

Reads a JSON array from stdin and prints one `key=value` (dotenv-style) line per resolved field per record — a flat, greppable view of every record's fields.

It uses the **same structure grammar** as `render table` / `render csv` / `aux4 2table`:

- `structure` (positional, optional) — comma-separated fields with the usual grammar:
  - `name,age,city` — select those top-level fields.
  - `address[street,city]` — nested groups flatten to **dotted keys** (`address.street=...`, `address.city=...`).
  - `field:"Label"` (or `field:Label`) — rename the emitted key. `address[street:"Street Address"]` emits `Street Address=Main St`; the label replaces the whole key.
  - A bare object field with no brackets (`address`) emits the sub-object as a single JSON value.
  - Column-width modifiers like `{width:20}` are accepted but silently ignored, so a structure you also use with `table`/`csv` can be pasted unchanged.
- `--index <N>` (optional) — 0-based index selecting a **single** record from the top-level array before anything else runs. The selected record is rendered on its own with no index prefix (see array flattening below). An out-of-range index (`N` ≥ record count, or `N` < 0) prints a clear error to stderr and exits `1`. Omit it to render every record.

Omit the structure to auto-flatten **every** field recursively into dotted keys.

### Array flattening

Arrays are flattened uniformly at **every** level — including the top-level array of records — into **indexed dotted keys**, using each element's position as a path segment:

- A nested array field `tags: ["a", "b"]` becomes `tags.0=a`, `tags.1=b` (a single-element array is still indexed: `tags.0=a`).
- Arrays of arrays recurse the same way: `matrix: [[1, 2], [3, 4]]` becomes `matrix.0.0=1`, `matrix.0.1=2`, `matrix.1.0=3`, `matrix.1.1=4`.
- When the top-level array has **more than one** record, each record's keys are prefixed with its 0-based index (`0.name=Alice`, `1.name=Bob`), so record boundaries are unambiguous.
- **Exception:** a single record gets **no** index prefix — a lone JSON object, a one-element array, or a record picked with `--index N` is treated as *the* record (`name=Alice`, not `0.name=Alice`).

Input (`person.json`):

```json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" }, "tags": ["a", "b"] }
]
```

Explicit structure with a nested group and a rename:

```bash
cat person.json | aux4 render kv 'name,address[street,city:"City"]'
```

```text
name=Alice
address.street=Main St
City=NYC
```

No structure — auto-flatten every field (arrays become indexed keys):

```bash
cat person.json | aux4 render kv
```

```text
name=Alice
address.street=Main St
address.city=NYC
tags.0=a
tags.1=b
```

Multiple records — each record is prefixed with its index:

```bash
echo '[{"name":"Alice","tags":["a","b"]},{"name":"Bob","tags":["c"]}]' | aux4 render kv
```

```text
0.name=Alice
0.tags.0=a
0.tags.1=b
1.name=Bob
1.tags.0=c
```

Select a single record with `--index` (rendered with no prefix):

```bash
echo '[{"name":"Alice","tags":["a","b"]},{"name":"Bob","tags":["c"]}]' | aux4 render kv --index 1
```

```text
name=Bob
tags.0=c
```

### aux4 render yaml

Reads a JSON array from stdin and prints it as **YAML**, preserving nesting. It shares the **same structure grammar** as `render kv` for selecting fields, but unlike `kv` — which flattens the selection into dotted `key=value` lines — `yaml` keeps the selection **nested** in the output.

- `structure` (positional, optional) — comma-separated fields with the usual grammar:
  - `name,age,city` — select those top-level fields.
  - `address[street,city]` — nested groups stay **nested**: an `address:` mapping with `street`/`city` under it (**not** flat `address.street`/`address.city` keys).
  - `field:"Label"` (or `field:Label`) — rename the emitted key. `address[street,city:"City"]` emits a `City:` key inside the nested `address` mapping.
  - Applying a `field[...]` group to an array projects each element through the group, producing a YAML sequence of nested mappings.
  - Column-width modifiers like `{width:20}` are accepted but silently ignored, so a structure you also use with `table`/`csv`/`kv` can be pasted unchanged.
- `--index <N>` (optional) — 0-based index selecting a **single** record from the top-level array before serialization. The selected record is rendered as a single YAML mapping. An out-of-range index (`N` ≥ record count, or `N` < 0) prints a clear error to stderr and exits `1`. Omit it to render every record.

Omit the structure to dump the full record as-is — there is no flattening step, since YAML represents nested structure natively.

A single record (a lone JSON object, a one-element array, or a record picked with `--index N`) is dumped as a single YAML **mapping**; multiple records are dumped as a YAML **sequence** of mappings.

Input (`person.json`):

```json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC", "zip": "10001" } }
]
```

Explicit structure with a nested group and a rename (nesting preserved, `zip` dropped):

```bash
cat person.json | aux4 render yaml 'name,address[street,city:"City"]'
```

```text
name: Alice
address:
  street: Main St
  City: NYC
```

No structure — dump the full record:

```bash
cat person.json | aux4 render yaml
```

```text
name: Alice
address:
  street: Main St
  city: NYC
  zip: '10001'
```

Multiple records — dumped as a YAML sequence:

```bash
echo '[{"name":"Alice"},{"name":"Bob"}]' | aux4 render yaml
```

```text
- name: Alice
- name: Bob
```

Select a single record with `--index` (rendered as a single mapping):

```bash
echo '[{"name":"Alice"},{"name":"Bob"}]' | aux4 render yaml --index 1
```

```text
name: Bob
```

### aux4 render table

Reads a JSON array from stdin and renders an ASCII table by delegating to `aux4 2table`. The full 2table structure language is supported (simple columns, nested objects and arrays, renaming, fixed widths, auto-structure).

Options:

- `table` (positional) — The table structure (column list) to output. Omit to auto-generate.
- `--lineNumbers <true|false>` — Add a first column with line numbers starting from 1 (default: false). Forwarded to 2table.
- `--showInvalidLines <true|false>` — Show invalid lines as `<invalid line>` instead of skipping them (default: false). Forwarded to 2table.
- `--inputStream <true|false>` — Stream stdin line-by-line and render an aligned (borderless) table live, freezing column widths from the header names plus the first record (default: false). See [Streaming with `--inputStream`](#streaming-with---inputstream). Rendered in-process; `--lineNumbers`/`--showInvalidLines` do not apply in streaming mode.

ASCII table:

```bash
cat people.json | aux4 render table firstName,lastName,role
```

```text
 firstName  lastName  role
 Ada        Lovelace  Engineer
 Linus      Torvalds  Maintainer
```

Line numbers and invalid-line handling (forwarded to 2table):

```bash
cat data.json | aux4 render table name,age --lineNumbers true --showInvalidLines true
```

```text
 #  name     age
 1  Alice     30
 2  <invalid line>
 3  Charlie   35
```

**Note:** `render table` requires the `aux4/2table` package. It is declared as a dependency and installed automatically. If `aux4 2table` is not available at runtime, the command fails with a clear message rather than doing nothing.

### aux4 render csv

Reads a JSON array from stdin and renders CSV by delegating to `aux4 2table --format csv`. The full 2table structure language is supported (simple columns, nested objects and arrays, renaming, auto-structure). Output is RFC 4180 CSV: a field containing a comma, double quote, or newline is quoted automatically.

Options:

- `table` (positional) — The table structure (column list) to output. Omit to auto-generate.
- `--lineNumbers <true|false>` — Add a first column with line numbers starting from 1 (default: false). Forwarded to 2table.
- `--showInvalidLines <true|false>` — Show invalid lines as `<invalid line>` instead of skipping them (default: false). Forwarded to 2table.
- `--inputStream <true|false>` — Stream stdin line-by-line and print CSV live: the header once (from the structure or the first record's keys), then one RFC 4180 line per record (default: false). See [Streaming with `--inputStream`](#streaming-with---inputstream). Rendered in-process; `--lineNumbers`/`--showInvalidLines` do not apply in streaming mode.

Input (`people.json`):

```json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob, Jr.", "age": 25 }
]
```

```bash
cat people.json | aux4 render csv name,age
```

```text
name,age
Alice,30
"Bob, Jr.",25
```

A value containing a comma (`Bob, Jr.`) is quoted automatically, because delegation goes through 2table's RFC 4180 CSV renderer.

**Note:** `render csv` requires the `aux4/2table` package. It is declared as a dependency and installed automatically. If `aux4 2table` is not available at runtime, the command fails with a clear message rather than doing nothing.

## License

This package is licensed under the [Apache License 2.0](./LICENSE).

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
