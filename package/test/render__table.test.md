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
