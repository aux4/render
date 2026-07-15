# aux4/render

Render a JSON array from standard input as a human-readable view. Pipe the raw JSON output of any aux4 command through `aux4 render` to get a tidy list or table in the terminal.

`aux4/render` provides four commands:

- `aux4 render list` — an MUI-List-style view (icon, primary, secondary, and a right-aligned badge label).
- `aux4 render table` — a table view that delegates to [`aux4/2table`](https://github.com/aux4/2table).
- `aux4 render csv` — a CSV view that delegates to [`aux4/2table`](https://github.com/aux4/2table).
- `aux4 render kv` — a flat `key=value` (dotenv-style) view that flattens each record's fields, using the same structure grammar as `render table`/`csv`.

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
Ada Lovelace                                                              active
Engineer

Linus Torvalds                                                              away
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

## Field interpolation

Every `render list` template flag (`--icon`, `--primary`, `--secondary`, `--badge`) is resolved against the current record using one consistent rule:

- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style). `--secondary date` renders `record.date`. Dot notation works for nested fields: `--secondary address.city`. If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when missing) and the rest of the string is kept literal. `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps them clear of aux4's own execute-line `${...}` substitution. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally.

## Input handling

Both commands read JSON from standard input and handle these cases consistently:

- **JSON array** — rendered as usual, one row per element.
- **A single JSON object** (not wrapped in an array) — treated as a one-item array and rendered normally.
- **An empty array (`[]`)** — a clean no-op: nothing is printed and the command exits `0`.
- **Invalid / non-JSON input** — the command prints a clear error to stderr and exits `1`.

## Commands

### aux4 render list

Reads a JSON array from stdin and prints one block per record.

Options:

- `--primary <template>` — Primary line (required). Bare field name or `$field` interpolation. A list item's primary is a single line: when it is too long to fit the terminal width (accounting for the icon prefix and the badge, if present), it is truncated with a trailing `…` rather than wrapping.
- `--secondary <template>` — Secondary line, printed beneath the primary and indented to align under it.
- `--icon <template>` — Rendered before the primary line.
- `--badge <template>` — Right-aligned on the primary line to the terminal width (80 columns when not a TTY, e.g. in a pipe). Plain text, not interactive.

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
Ada Lovelace                                                              active
Engineer

Linus Torvalds                                                              away
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

### aux4 render table

Reads a JSON array from stdin and renders an ASCII table by delegating to `aux4 2table`. The full 2table structure language is supported (simple columns, nested objects and arrays, renaming, fixed widths, auto-structure).

Options:

- `table` (positional) — The table structure (column list) to output. Omit to auto-generate.
- `--lineNumbers <true|false>` — Add a first column with line numbers starting from 1 (default: false). Forwarded to 2table.
- `--showInvalidLines <true|false>` — Show invalid lines as `<invalid line>` instead of skipping them (default: false). Forwarded to 2table.

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
