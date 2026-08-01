#### Description

The `table` command reads a JSON array from standard input and renders it as an ASCII table. It is a thin wrapper that delegates to the installed `aux4 2table` command rather than reimplementing table logic, so the full 2table structure language is available: simple columns, nested objects and arrays, column renaming, fixed widths, and auto-generated structure when no columns are given.

The output is always ASCII — the command delegates to `aux4 2table` with no `--format` flag, relying on 2table's own ascii default. The positional table structure and the `--lineNumbers` / `--showInvalidLines` flags are forwarded straight through to `aux4 2table` (both flags default to `false`, matching 2table).

**Value formatting (`{format:...}`)** — the per-column `field{format:TYPE,option:value,...}` modifier is forwarded verbatim to `aux4 2table`, which owns the formatting (types `number`, `currency`, `percent`, `date`, `time`, `datetime`; option keys `decimals`, `currency`, `locale`, `style`). `render`'s own kv/yaml/list formatting is powered by the same code vendored from `aux4/2table`, so results match. Requires a current `aux4/2table` that supports `{format:...}`.

**Requires the `aux4/2table` package.** It is declared as a dependency, so installing `aux4/render` pulls it in. If `aux4 2table` is not available at runtime, the command fails with a clear message instead of silently doing nothing.

Input handling: a single JSON object is treated as a one-item array; **NDJSON** (one JSON object per line) is auto-detected when stdin is not a single JSON document (blank lines ignored, a bad line errors with its 1-based line number and exits `1`); an empty array (`[]`) prints nothing and exits `0` (rather than surfacing 2table's "Input array cannot be empty" error); invalid/non-JSON input prints a clear error to stderr and exits `1` before 2table is invoked.

**Streaming with `--inputStream`** — with `--inputStream`, `table` does **not** delegate to 2table (which would need the whole array up front). Instead it streams stdin line-by-line (NDJSON) and renders an aligned table live in 2table's borderless ascii style (no box). Because rows arrive one at a time, each column's width is **frozen from the header name plus the first record's cell**; every later row is clamped to that width — padded when short, or **truncated with a trailing `…`** when longer — so the columns stay aligned. An explicit `field{width:N}` always wins. The header and first data row are emitted immediately, then each subsequent row as it arrives. When no structure is given, columns are derived from the first record's keys. `--lineNumbers`/`--showInvalidLines` do not apply in streaming mode.

#### Usage

```bash
cat data.json | aux4 render table [<table-structure>] [--lineNumbers <true|false>] [--showInvalidLines <true|false>] [--inputStream <true|false>]
```

table              The table structure (column list) to output, forwarded to aux4 2table. Omit to auto-generate.
--lineNumbers      Add a first column with line numbers starting from 1 (default: false).
--showInvalidLines Show invalid lines as `<invalid line>` instead of skipping them (default: false).
--inputStream           Stream stdin line-by-line and render an aligned (borderless) table live, freezing widths from the header + first record (default: false).

#### Example

Input (`people.json`):

```json
[
  { "name": "Alice", "age": 30, "city": "New York" },
  { "name": "Bob", "age": 25, "city": "Los Angeles" }
]
```

ASCII table:

```bash
cat people.json | aux4 render table name,age,city
```

```text
 name    age  city
 Alice    30  New York
 Bob      25  Los Angeles
```

Value formatting is forwarded to 2table:

```bash
echo '[{"name":"Widget","price":1234.5},{"name":"Gadget","price":9.5}]' \
  | aux4 render table 'name,price{format:currency,currency:USD,locale:en-US}'
```

```text
 name        price
 Widget  $1,234.50
 Gadget      $9.50
```

Streaming mode — stream an NDJSON log into a live table (widths frozen from the first row, later over-wide cells truncated with `…`):

```bash
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob","city":"SanFranciscoBayArea"}\n' \
  | aux4 render table name,city --inputStream
```

```text
 name  city
 Ada   NYC
 Bob   San…
```
