# render list

## plain field mode

### should use bare field names for primary and secondary

```file:people.json
[
  { "name": "Alice", "date": "2026-01-01" },
  { "name": "Bob", "date": "2026-02-02" }
]
```

```execute
cat people.json | aux4 render list --primary name --secondary date
```

```expect
Alice
2026-01-01

Bob
2026-02-02
```

## interpolation mode

### should replace $field tokens with record values

```file:people.json
[
  { "firstName": "Ada", "lastName": "Lovelace" }
]
```

```execute
cat people.json | aux4 render list --primary '$firstName $lastName'
```

```expect
Ada Lovelace
```

### should render missing $field tokens as empty

```file:people.json
[
  { "firstName": "Ada" }
]
```

```execute
cat people.json | aux4 render list --primary '$firstName $lastName'
```

```expect
Ada
```

## icon

### should render an icon from a field before the primary line

```file:people.json
[
  { "emoji": "*", "name": "Alice" }
]
```

```execute
cat people.json | aux4 render list --icon emoji --primary name
```

```expect
* Alice
```

## actions

### should right-align the actions label to width 80

```file:people.json
[
  { "name": "Alice", "status": "active" }
]
```

```execute
cat people.json | aux4 render list --primary name --actions status
```

```expect:regex
^Alice {69}active$
```

## format json passthrough

### should pass the original stdin JSON through untouched

```file:compact.json
[{"name":"Alice"},{"name":"Bob"}]
```

```execute
cat compact.json | aux4 render list --primary name --format json
```

```expect
[{"name":"Alice"},{"name":"Bob"}]
```
