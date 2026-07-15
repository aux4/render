# render kv

## explicit structure — flat fields

### should render key=value using the selected fields, prefixing each of the multiple records

```file:settings.json
[
  { "name": "HOST", "val": "localhost", "extra": "ignored" },
  { "name": "PORT", "val": "3000", "extra": "ignored" }
]
```

```execute
cat settings.json | aux4 render kv name,val
```

```expect
0.name=HOST
0.val=localhost
1.name=PORT
1.val=3000
```

## explicit structure — nested group

### should flatten a nested group into dotted keys

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" } }
]
```

```execute
cat person.json | aux4 render kv 'name,address[street,city]'
```

```expect
name=Alice
address.street=Main St
address.city=NYC
```

## explicit structure — rename

### should override the emitted key with the label

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" } }
]
```

```execute
cat person.json | aux4 render kv 'name,address[street:"Street Address",city:City]'
```

```expect
name=Alice
Street Address=Main St
City=NYC
```

## no structure — auto flatten

### should auto-flatten every field including nested objects into dotted keys

```file:person.json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" } }
]
```

```execute
cat person.json | aux4 render kv
```

```expect
name=Alice
address.street=Main St
address.city=NYC
```

## array-valued field

### should flatten a nested array into indexed dotted keys with an explicit structure

```file:tagged.json
[
  { "name": "Alice", "tags": ["a", "b"] }
]
```

```execute
cat tagged.json | aux4 render kv name,tags
```

```expect
name=Alice
tags.0=a
tags.1=b
```

### should flatten a nested array into indexed dotted keys in auto-flatten mode too

```file:tagged.json
[
  { "name": "Alice", "tags": ["a", "b"] }
]
```

```execute
cat tagged.json | aux4 render kv
```

```expect
name=Alice
tags.0=a
tags.1=b
```

### should index a single-element nested array (still an array, no root exception)

```file:one-tag.json
[
  { "name": "Alice", "tags": ["a"] }
]
```

```execute
cat one-tag.json | aux4 render kv
```

```expect
name=Alice
tags.0=a
```

### should recurse into arrays of arrays

```file:matrix.json
[
  { "matrix": [[1, 2], [3, 4]] }
]
```

```execute
cat matrix.json | aux4 render kv
```

```expect
matrix.0.0=1
matrix.0.1=2
matrix.1.0=3
matrix.1.1=4
```

## multiple records — root index prefix

### should prefix each record with its 0-based index in auto-flatten mode

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv
```

```expect
0.name=Alice
0.tags.0=a
0.tags.1=b
1.name=Bob
1.tags.0=c
```

### should prefix each record with its 0-based index with an explicit structure

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv name,tags
```

```expect
0.name=Alice
0.tags.0=a
0.tags.1=b
1.name=Bob
1.tags.0=c
```

## --index — select a single record

### should select the Nth record and render it with no index prefix

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv --index 1
```

```expect
name=Bob
tags.0=c
```

### should select the first record with --index 0

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv --index 0
```

```expect
name=Alice
tags.0=a
tags.1=b
```

### should compose --index with an explicit structure

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv name --index 0
```

```expect
name=Alice
```

### should fail with exit 1 when --index is out of range

```file:people.json
[
  { "name": "Alice", "tags": ["a", "b"] },
  { "name": "Bob", "tags": ["c"] }
]
```

```execute
cat people.json | aux4 render kv --index 5; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
--index 5 is out of range: 2 record(s) available.
```

### should fail with exit 1 when --index is negative

Use the `--index=<value>` form so the shell/CLI passes the leading-dash value through unchanged.

```execute
echo '[{"name":"Alice"}]' | aux4 render kv --index=-1; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
--index -1 is out of range: 1 record(s) available.
```

## empty array

### should print nothing and exit 0 for an empty array

```execute
echo '[]' | aux4 render kv name,val; echo "exit=$?"
```

```expect
exit=0
```

## single object

### should treat a single object as a one-item array

```execute
echo '{"name":"HOST","val":"localhost"}' | aux4 render kv name,val
```

```expect
name=HOST
val=localhost
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render kv name,val; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin: *?
```
