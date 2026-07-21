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

## value format

A `field{format:...}` modifier renders the field's value through the shared
formatter (vendored from aux4/2table). Tests pin `locale:en-US` and run under
`TZ=UTC` so the output is deterministic regardless of the host machine.

### should format a currency value

```execute
echo '[{"name":"Widget","price":1234.5}]' | TZ=UTC aux4 render kv 'name,price{format:currency,currency:USD,locale:en-US}'
```

```expect
name=Widget
price=$1,234.50
```

### should format a number with decimals:0 rounding and grouping

```execute
echo '[{"n":1234567.89}]' | TZ=UTC aux4 render kv 'n{format:number,decimals:0,locale:en-US}'
```

```expect
n=1,234,568
```

### should treat a percent value as a ratio

```execute
echo '[{"rate":0.1234}]' | TZ=UTC aux4 render kv 'rate{format:percent,decimals:1,locale:en-US}'
```

```expect
rate=12.3%
```

### should render a short date via the style key

```execute
echo '[{"born":"1990-05-01"}]' | TZ=UTC aux4 render kv 'born{format:date,style:short,locale:en-US}'
```

```expect
born=5/1/90
```

### should keep a comma inside the format modifier grouped (no field split)

```execute
echo '[{"amount":9.5,"tax":0.08}]' | TZ=UTC aux4 render kv 'amount{format:currency,currency:USD,locale:en-US},tax{format:percent,decimals:0,locale:en-US}'
```

```expect
amount=$9.50
tax=8%
```

### should fall back to an empty string for a null value and the raw value for an un-parseable one

```execute
echo '[{"price":null,"bad":"N/A"}]' | TZ=UTC aux4 render kv 'price{format:currency,locale:en-US},bad{format:number,locale:en-US}'
```

```expect
price=
bad=N/A
```

### should accept a non-format modifier and ignore it (arrays still flatten)

```execute
echo '[{"name":"A","tags":["x","y"]}]' | aux4 render kv 'name,tags{width:20}'
```

```expect
name=A
tags.0=x
tags.1=y
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
