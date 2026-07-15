# aux4/render

Render a JSON array from standard input as a human-readable view. Pipe the raw JSON output of any aux4 command through `aux4 render` to get a tidy list or table in the terminal.

`aux4/render` provides two commands:

- `aux4 render list` — an MUI-List-style view (icon, primary, secondary, and a right-aligned badge label).
- `aux4 render table` — a table view that delegates to [`aux4/2table`](https://github.com/aux4/2table).

## Installation

```bash
aux4 aux4 pkger install aux4/render
```

## System Dependencies

This package runs on Node.js. If it is not already available, the installer can provision it:

- [brew](/r/public/packages/aux4/system-installer-brew)
- [linux](/r/public/packages/aux4/system-installer-linux)

The `render table` command delegates to `aux4 2table`, which is declared as a package dependency and installed automatically.

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

Every template flag (`--icon`, `--primary`, `--secondary`, `--badge`) is resolved against the current record using one consistent rule:

- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style). `--secondary date` renders `record.date`. Dot notation works for nested fields: `--secondary address.city`. If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when missing) and the rest of the string is kept literal. `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps them clear of aux4's own execute-line `${...}` substitution. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally.

## Commands

### aux4 render list

Reads a JSON array from stdin and prints one block per record.

Options:

- `--primary <template>` — Primary line (required). Bare field name or `$field` interpolation.
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

## License

This package is licensed under the [Apache License 2.0](./LICENSE).

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
