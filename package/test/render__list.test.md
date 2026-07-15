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

### should render a literal icon when the value is not a field name

```file:people.json
[
  { "name": "Alice" },
  { "name": "Bob" }
]
```

```execute
cat people.json | aux4 render list --primary name --icon X
```

```expect
X Alice

X Bob
```

### should prefer the field value over a literal when the key exists

```file:people.json
[
  { "name": "Alice", "emoji": "@" }
]
```

```execute
cat people.json | aux4 render list --primary name --icon emoji
```

```expect
@ Alice
```

## badge

### should right-align the badge label to width 80

```file:people.json
[
  { "name": "Alice", "status": "active" }
]
```

```execute
cat people.json | aux4 render list --primary name --badge status
```

```expect:regex
^Alice {69}active$
```

### should render a literal badge when the value is not a field name

```file:people.json
[
  { "name": "Alice" }
]
```

```execute
cat people.json | aux4 render list --primary name --badge done
```

```expect:regex
^Alice {71}done$
```

## long primary

### should truncate an overlong primary with an ellipsis and keep the badge right-aligned

When the primary text is longer than the available width (80 columns when not a TTY, minus the badge plus a one-space gap), it is truncated with a trailing `…` so the badge still right-aligns to width 80. Here the badge `done` reserves 5 columns (4 + one gap), leaving 75 for the primary: 74 characters survive plus the ellipsis.

```file:long.json
[
  { "title": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "status": "done" }
]
```

```execute
cat long.json | aux4 render list --primary title --badge status
```

```expect:regex
^x{74}… done$
```

### should truncate an overlong primary with an ellipsis when there is no badge

Without a badge the primary is truncated to fit the full width (80 columns): 79 characters survive plus the ellipsis.

```file:long.json
[
  { "title": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

```execute
cat long.json | aux4 render list --primary title
```

```expect:regex
^x{79}…$
```

## empty array

### should print nothing and exit 0 for an empty array

```execute
echo '[]' | aux4 render list --primary title; echo "exit=$?"
```

```expect
exit=0
```

## single object

### should treat a single object as a one-item array

```execute
echo '{"name":"Alice"}' | aux4 render list --primary name
```

```expect
Alice
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render list --primary title; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin: *?
```

## missing primary

### should fail fast with a clear error when --primary is omitted

When no `--primary` is given, the command must not prompt (which would eat the piped JSON) — it invokes the script, which fails immediately with an error on stderr and a non-zero exit.

```file:people.json
[
  { "title": "a" }
]
```

```execute
cat people.json | aux4 render list; echo "exit=$?"
```

```expect
exit=2
```

```error:partial
No --primary template provided. Use --primary <field-or-template>.
```
