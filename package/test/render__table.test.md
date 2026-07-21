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
Invalid JSON on stdin: *?
```
