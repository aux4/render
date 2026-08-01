# render yaml

## no structure — full object dump

### should dump the full record as YAML preserving nesting

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC", "zip": "10001" } }
]
```

```execute
cat person.json | aux4 render yaml
```

```expect
name: Alice
address:
  street: Main St
  city: NYC
  zip: '10001'
```

## explicit structure — nested selection

### should keep the selection nested instead of flattening to dotted keys

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC", "zip": "10001" } }
]
```

```execute
cat person.json | aux4 render yaml 'name,address[street,city]'
```

```expect
name: Alice
address:
  street: Main St
  city: NYC
```

## explicit structure — rename

### should rename the nested key via field:"Label"

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC", "zip": "10001" } }
]
```

```execute
cat person.json | aux4 render yaml 'name,address[street,city:"City"]'
```

```expect
name: Alice
address:
  street: Main St
  City: NYC
```

## multiple records — YAML sequence

### should dump multiple records as a YAML sequence

```file:people.json
[
  { "name": "Alice" },
  { "name": "Bob" }
]
```

```execute
cat people.json | aux4 render yaml
```

```expect
- name: Alice
- name: Bob
```

### should apply an explicit structure to each record in the sequence

```file:people.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" } },
  { "name": "Bob", "address": { "street": "2nd Ave", "city": "LA" } }
]
```

```execute
cat people.json | aux4 render yaml 'name,address[city]'
```

```expect
- name: Alice
  address:
    city: NYC
- name: Bob
  address:
    city: LA
```

## single record — single mapping

### should dump a one-element array as a single YAML mapping, not a sequence

```file:one.json
[
  { "name": "Alice" }
]
```

```execute
cat one.json | aux4 render yaml
```

```expect
name: Alice
```

### should treat a single object as one record

```execute
echo '{"name":"Alice","age":30}' | aux4 render yaml
```

```expect
name: Alice
age: 30
```

## --index — select a single record

### should select the Nth record and render it as a single mapping

```file:people.json
[
  { "name": "Alice" },
  { "name": "Bob" }
]
```

```execute
cat people.json | aux4 render yaml --index 1
```

```expect
name: Bob
```

### should compose --index with an explicit structure

```file:people.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" } },
  { "name": "Bob", "address": { "street": "2nd Ave", "city": "LA" } }
]
```

```execute
cat people.json | aux4 render yaml 'name,address[city]' --index 0
```

```expect
name: Alice
address:
  city: NYC
```

### should fail with exit 1 when --index is out of range

```file:people.json
[
  { "name": "Alice" },
  { "name": "Bob" }
]
```

```execute
cat people.json | aux4 render yaml --index 5; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
--index 5 is out of range: 2 record(s) available.
```

## value format

A `field{format:...}` modifier renders the selected field's value through the
shared formatter (vendored from aux4/2table). A formatted value intentionally
becomes a display string; fields without a modifier keep their original typed
value and nesting. Tests pin `locale:en-US` and run under `TZ=UTC`.

### should format a currency leaf as a display string and preserve other typed fields

```execute
echo '[{"name":"Widget","price":1234.5,"qty":3}]' | TZ=UTC aux4 render yaml 'name,price{format:currency,currency:USD,locale:en-US},qty'
```

```expect
name: Widget
price: $1,234.50
qty: 3
```

### should format a datetime leaf via the style key

```execute
echo '[{"ts":"2026-07-15T02:30:00Z"}]' | TZ=UTC aux4 render yaml 'ts{format:datetime,style:short,locale:en-US}'
```

```expect
ts: 7/15/26, 2:30 AM
```

### should format a nested leaf inside a group

```execute
echo '[{"order":{"total":99.9}}]' | TZ=UTC aux4 render yaml 'order[total{format:currency,currency:USD,locale:en-US}]'
```

```expect
order:
  total: $99.90
```

## empty array

### should print nothing and exit 0 for an empty array

```execute
echo '[]' | aux4 render yaml; echo "exit=$?"
```

```expect
exit=0
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render yaml; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin (line 1): *?
```

## NDJSON input

`render yaml` accepts NDJSON (one JSON object per line), auto-detected when stdin is
not a single JSON document. Multiple records dump as a YAML sequence.

### should dump NDJSON records as a YAML sequence

```execute
printf '{"name":"Alice"}\n{"name":"Bob"}\n' | aux4 render yaml name
```

```expect
- name: Alice
- name: Bob
```
