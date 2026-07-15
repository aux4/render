# render kv

## explicit structure — flat fields

### should render key=value using the selected fields

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
name=HOST
val=localhost
name=PORT
val=3000
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

### should JSON.stringify an array as a single value, not expand it

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
tags=["a","b"]
```

### should JSON.stringify an array in auto-flatten mode too

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
tags=["a","b"]
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
