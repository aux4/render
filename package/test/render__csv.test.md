# render csv

## csv output

### should delegate to aux4 2table and render CSV

```file:people.json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob", "age": 25 }
]
```

```execute
cat people.json | aux4 render csv name,age
```

```expect
name,age
Alice,30
Bob,25
```

## quoting

### should quote a value containing a comma

```file:commas.json
[
  { "name": "Alice", "age": 30 },
  { "name": "Bob, Jr.", "age": 25 }
]
```

```execute
cat commas.json | aux4 render csv name,age
```

```expect
name,age
Alice,30
"Bob, Jr.",25
```

## value format pass-through

The `{format:...}` column modifier is forwarded verbatim to `aux4 2table --format csv`, which owns the actual formatting. Pinned to `locale:en-US` under `TZ=UTC` for determinism. Requires a current `aux4/2table` that supports `{format:...}`.

### should forward a currency format modifier to aux4 2table and quote the formatted value

The formatted value `$1,234.50` contains a comma, so 2table's RFC 4180 CSV renderer quotes it.

```file:prices.json
[
  { "name": "Widget", "price": 1234.5 }
]
```

```execute
cat prices.json | TZ=UTC aux4 render csv 'name,price{format:currency,currency:USD,locale:en-US}'
```

```expect
name,price
Widget,"$1,234.50"
```

## empty array

### should print nothing and exit 0 for an empty array

`aux4 2table` errors on an empty array, so `render csv` treats it as a clean no-op instead.

```execute
echo '[]' | aux4 render csv name,age; echo "exit=$?"
```

```expect
exit=0
```

## single object

### should treat a single object as a one-item array

```execute
echo '{"name":"Alice","age":30}' | aux4 render csv name,age
```

```expect
name,age
Alice,30
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render csv name,age; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin (line 1): *?
```

## NDJSON input

`render csv` also accepts NDJSON (one JSON object per line), auto-detected when
stdin is not a single JSON document.

### should render CSV from NDJSON input

```execute
printf '{"name":"Alice","age":30}\n{"name":"Bob","age":25}\n' | aux4 render csv name,age
```

```expect
name,age
Alice,30
Bob,25
```

## inputStream

With `--inputStream`, `render csv` streams stdin line-by-line: it prints the header row
once (from the `--table` structure, or the first record's keys), then one RFC 4180
CSV line per record as it arrives.

### should print the header once then one CSV line per streamed record

```execute
printf '{"name":"Alice","age":30}\n{"name":"Bob","age":25}\n' | aux4 render csv name,age --inputStream
```

```expect
name,age
Alice,30
Bob,25
```

### should quote a value containing a comma while streaming

```execute
printf '{"name":"Ada","city":"NYC"}\n{"name":"Bob, Jr.","city":"LA"}\n' | aux4 render csv name,city --inputStream
```

```expect
name,city
Ada,NYC
"Bob, Jr.",LA
```

### should derive the header from the first record when no structure is given

```execute
printf '{"name":"Ada","age":1}\n{"name":"Bob","age":2}\n' | aux4 render csv --inputStream
```

```expect
name,age
Ada,1
Bob,2
```
