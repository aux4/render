# render table

## ascii format

### should delegate to aux4 2table and render an ASCII table

```file:people.json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob", "age": 25 }
]
```

```execute
cat people.json | aux4 render table name,age
```

```expect
 name   age
 Alice   30
 Bob     25
```

## invalid rows

### should forward lineNumbers and showInvalidLines to aux4 2table

```file:invalid.json
[{"name":"Alice","age":30},
"bad",
{"name":"Charlie","age":35}]
```

```execute
cat invalid.json | aux4 render table name,age --lineNumbers true --showInvalidLines true
```

```expect
 #  name            age
 1  Alice            30
 2  <invalid line>
 3  Charlie          35
```

## value format pass-through

The `{format:...}` column modifier is forwarded verbatim to `aux4 2table`, which
owns the actual formatting. Pinned to `locale:en-US` under `TZ=UTC` for
determinism. Requires a current `aux4/2table` that supports `{format:...}`.

### should forward a currency format modifier to aux4 2table

```file:prices.json
[
  { "name": "Widget", "price": 1234.5 },
  { "name": "Gadget", "price": 9.5 }
]
```

```execute
cat prices.json | TZ=UTC aux4 render table 'name,price{format:currency,currency:USD,locale:en-US}'
```

```expect
 name        price
 Widget  $1,234.50
 Gadget      $9.50
```

## empty array

### should print nothing and exit 0 for an empty array

`aux4 2table` errors on an empty array, so `render table` treats it as a clean no-op instead.

```execute
echo '[]' | aux4 render table name,age; echo "exit=$?"
```

```expect
exit=0
```

## single object

### should treat a single object as a one-item array

```execute
echo '{"name":"Alice","age":30}' | aux4 render table name,age
```

```expect
 name   age
 Alice   30
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render table name,age; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin (line 1): *?
```

## NDJSON input

`render table` also accepts NDJSON (one JSON object per line), auto-detected when
stdin is not a single JSON document.

### should render a table from NDJSON input

```execute
printf '{"name":"Alice","age":30}\n{"name":"Bob","age":25}\n' | aux4 render table name,age
```

```expect
 name   age
 Alice   30
 Bob     25
```

## inputStream

With `--inputStream`, `render table` streams stdin line-by-line and renders an aligned
table live in aux4/2table's borderless ascii style (no box). Column widths are
FROZEN from the header names plus the FIRST record; later rows are clamped to those
widths — padded when short, truncated with `…` when longer — so the columns stay
aligned even under `tail -f`.

### should freeze widths from the first row and truncate an over-wide later row

The `city` column freezes to width 4 (max of header `city` and the first value
`NYC`). The second row's `SanFranciscoBayArea` exceeds 4 columns, so it is truncated
to `San…` (three chars + ellipsis) keeping the columns aligned.

```execute
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob","city":"SanFranciscoBayArea"}\n' | aux4 render table name,city --inputStream
```

```expect
 name  city
 Ada   NYC
 Bob   San…
```

### should honor an explicit column width over the frozen first-row width

`city{width:5}` fixes the column at width 5 regardless of the first row, so
`SanFranciscoBayArea` truncates to `SanF…`.

```execute
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob","city":"SanFranciscoBayArea"}\n' | aux4 render table 'name,city{width:5}' --inputStream
```

```expect
 name  city
 Ada   NYC
 Bob   SanF…
```

### should derive columns from the first record when no structure is given

```execute
printf '{"name":"Ada"}\n{"name":"Bob"}\n' | aux4 render table --inputStream
```

```expect
 name
 Ada
 Bob
```
