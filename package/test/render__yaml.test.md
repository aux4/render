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
Invalid JSON on stdin: *?
```
