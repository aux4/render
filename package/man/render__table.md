#### Description

The `table` command reads a JSON array from standard input and renders it as a table. It is a thin wrapper that delegates to the installed `aux4 2table` command rather than reimplementing table logic, so the full 2table structure language is available: simple columns, nested objects and arrays, column renaming, fixed widths, and auto-generated structure when no columns are given.

The positional table structure and the `--lineNumbers` / `--showInvalidLines` flags are forwarded straight through to `aux4 2table` (both flags default to `false`, matching 2table).

Formats:

- `ascii` (default) — forwards to `aux4 2table --format ascii`.
- `md` — forwards to `aux4 2table --format md`.
- `json` — passes the original standard input through untouched (no table rendering), so a pipeline can uniformly request either a table or raw JSON.

**Requires the `aux4/2table` package.** It is declared as a dependency, so installing `aux4/render` pulls it in. If `aux4 2table` is not available at runtime, the command fails with a clear message instead of silently doing nothing.

#### Usage

```bash
cat data.json | aux4 render table [<table-structure>] [--format <ascii|md|json>] [--lineNumbers <true|false>] [--showInvalidLines <true|false>]
```

table              The table structure (column list) to output, forwarded to aux4 2table. Omit to auto-generate.
--format           `ascii` (default) or `md` forward to aux4 2table; `json` passes the original stdin JSON through untouched.
--lineNumbers      Add a first column with line numbers starting from 1 (default: false).
--showInvalidLines Show invalid lines as `<invalid line>` instead of skipping them (default: false).

#### Example

Input (`people.json`):

```json
[
  { "name": "Alice", "age": 30, "city": "New York" },
  { "name": "Bob", "age": 25, "city": "Los Angeles" }
]
```

ASCII table (default):

```bash
cat people.json | aux4 render table name,age,city
```

```text
 name    age  city
 Alice    30  New York
 Bob      25  Los Angeles
```

Markdown table:

```bash
cat people.json | aux4 render table --format md name,age
```

```text
| name | age |
| --- | ---: |
| Alice | 30 |
| Bob | 25 |
```

Raw JSON passthrough for scripting:

```bash
cat people.json | aux4 render table name,age --format json
```

```text
[{"name":"Alice","age":30,"city":"New York"},{"name":"Bob","age":25,"city":"Los Angeles"}]
```
