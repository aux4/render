#### Description

The `csv` command reads a JSON array from standard input and renders it as CSV. Like `render table`, it is a thin wrapper that delegates to the installed `aux4 2table` command rather than reimplementing CSV logic, so the full 2table structure language is available: simple columns, nested objects and arrays, column renaming, and auto-generated structure when no columns are given.

The output is CSV — the command delegates to `aux4 2table --format csv`, which produces RFC 4180 output: a field containing a comma, double quote, carriage return, or newline is wrapped in double quotes, and embedded quotes are doubled. The positional table structure and the `--lineNumbers` / `--showInvalidLines` flags are forwarded straight through to `aux4 2table` (both flags default to `false`, matching 2table).

**Value formatting (`{format:...}`)** — the per-column `field{format:TYPE,option:value,...}` modifier is forwarded verbatim to `aux4 2table`, which owns the formatting (types `number`, `currency`, `percent`, `date`, `time`, `datetime`; option keys `decimals`, `currency`, `locale`, `style`). A formatted value that contains a comma (e.g. `$1,234.50`) is quoted by 2table's RFC 4180 renderer. Requires a current `aux4/2table` that supports `{format:...}`.

**Requires the `aux4/2table` package.** It is declared as a dependency, so installing `aux4/render` pulls it in. If `aux4 2table` is not available at runtime, the command fails with a clear message instead of silently doing nothing.

Input handling: a single JSON object is treated as a one-item array; **NDJSON** (one JSON object per line) is auto-detected when stdin is not a single JSON document (blank lines ignored, a bad line errors with its 1-based line number and exits `1`); an empty array (`[]`) prints nothing and exits `0` (rather than surfacing 2table's "Input array cannot be empty" error); invalid/non-JSON input prints a clear error to stderr and exits `1` before 2table is invoked.

**Streaming with `--inputStream`** — with `--inputStream`, `csv` does **not** delegate to 2table. It streams stdin line-by-line (NDJSON) and prints CSV live: the header row once (from the table structure, or the first record's keys when no structure is given), then one RFC 4180 CSV line per record as it arrives. `--lineNumbers`/`--showInvalidLines` do not apply in streaming mode.

#### Usage

```bash
cat data.json | aux4 render csv [<table-structure>] [--lineNumbers <true|false>] [--showInvalidLines <true|false>] [--inputStream <true|false>]
```

table              The table structure (column list) to output, forwarded to aux4 2table. Omit to auto-generate.
--lineNumbers      Add a first column with line numbers starting from 1 (default: false).
--showInvalidLines Show invalid lines as `<invalid line>` instead of skipping them (default: false).
--inputStream           Stream stdin line-by-line and print CSV live: header once, then one line per record (default: false).

#### Example

Input (`people.json`):

```json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob, Jr.", "age": 25 }
]
```

CSV output:

```bash
cat people.json | aux4 render csv name,age
```

```text
name,age
Alice,30
"Bob, Jr.",25
```

A value containing a comma is quoted automatically (`"Bob, Jr."`), because delegation goes through 2table's RFC 4180 CSV renderer.

Value formatting is forwarded to 2table; a formatted value with a comma is quoted:

```bash
echo '[{"name":"Widget","price":1234.5}]' | aux4 render csv 'name,price{format:currency,currency:USD,locale:en-US}'
```

```text
name,price
Widget,"$1,234.50"
```

Streaming mode — stream an NDJSON log into live CSV (header once, then one line per record):

```bash
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob, Jr.","city":"LA"}\n' \
  | aux4 render csv name,city --inputStream
```

```text
name,city
Ada,NYC
"Bob, Jr.",LA
```
