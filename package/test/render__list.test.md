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

## value-map

A `field[VALUE:label,...]` template looks up the record's field and maps its value through the bracketed table; an unmapped value falls back to the raw field value unchanged.

### should map a status value to an icon label

```execute
echo '[{"title":"Ship it","status":"IN_PROGRESS"}]' | aux4 render list --primary title --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'
```

```expect
🔧 Ship it
```

### should fall back to the raw field value for an unmapped icon

```execute
echo '[{"title":"Investigate","status":"BLOCKED"}]' | aux4 render list --primary title --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'
```

```expect
BLOCKED Investigate
```

### should map a status value to a secondary label

```execute
echo '[{"title":"Ship it","status":"IN_PROGRESS"}]' | aux4 render list --primary title --secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'
```

```expect
Ship it
In Progress
```

### should map a status value to a right-aligned badge label

The badge label `Done` (4 columns) is right-aligned to width 80, leaving 69 spaces after the 7-column primary `Ship it`.

```execute
echo '[{"title":"Ship it","status":"DONE"}]' | aux4 render list --primary title --badge 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'
```

```expect:regex
^Ship it {69}Done$
```

## named transforms

A `field:transformName` template applies a built-in transform to the record's field value. Date/time transforms are pinned to a fixed timezone and locale here (`TZ=America/New_York LC_ALL=en_US.UTF-8`) so the expected output is deterministic regardless of the host machine's defaults. The instant `2026-07-15T02:30:00Z` falls on the previous calendar day in New York, which is what makes the UTC→local conversion visible.

### should title-case a SCREAMING_SNAKE_CASE value

```execute
echo '[{"title":"T","status":"IN_PROGRESS"}]' | aux4 render list --primary title --secondary status:case
```

```expect
T
In Progress
```

### should title-case a snake_case value

```execute
echo '[{"title":"T","status":"in_progress"}]' | aux4 render list --primary title --secondary status:case
```

```expect
T
In Progress
```

### should render a date in the local timezone

```execute
echo '[{"title":"T","createdAt":"2026-07-15T02:30:00Z"}]' | TZ=America/New_York LC_ALL=en_US.UTF-8 aux4 render list --primary title --secondary createdAt:date
```

```expect
T
Jul 14, 2026
```

### should render a time in the local timezone

```execute
echo '[{"title":"T","createdAt":"2026-07-15T02:30:00Z"}]' | TZ=America/New_York LC_ALL=en_US.UTF-8 aux4 render list --primary title --secondary createdAt:time
```

```expect
T
10:30 PM
```

### should render a datetime in the local timezone

```execute
echo '[{"title":"T","createdAt":"2026-07-15T02:30:00Z"}]' | TZ=America/New_York LC_ALL=en_US.UTF-8 aux4 render list --primary title --secondary createdAt:datetime
```

```expect
T
Jul 14, 2026, 10:30 PM
```

### should format a number with locale thousands separators

```execute
echo '[{"title":"T","count":12000}]' | LC_ALL=en_US.UTF-8 aux4 render list --primary title --secondary count:number
```

```expect
T
12,000
```

### should fall back to the raw value when a date cannot be parsed

```execute
echo '[{"title":"T","createdAt":"not-a-date"}]' | aux4 render list --primary title --secondary createdAt:date
```

```expect
T
not-a-date
```

### should fall back to the raw value when a number cannot be parsed

```execute
echo '[{"title":"T","count":"N/A"}]' | aux4 render list --primary title --secondary count:number
```

```expect
T
N/A
```

## resolution regressions

### should treat a literal containing a colon as a literal, not a transform

`Status: unknown` has no brackets and no known transform name after its colon, so it falls through to the literal rule unchanged.

```execute
echo '[{"title":"T"}]' | aux4 render list --primary title --secondary 'Status: unknown'
```

```expect
T
Status: unknown
```

### should keep $-interpolation working alongside a value-map icon

```execute
echo '[{"first":"Ada","last":"Lovelace","status":"DONE"}]' | aux4 render list --primary '$first $last' --icon 'status[DONE:✅]'
```

```expect
✅ Ada Lovelace
```

### should keep the plain bare-field rule working with the new resolver

```execute
echo '[{"name":"Alice","date":"2026-01-01"}]' | aux4 render list --primary name --secondary date
```

```expect
Alice
2026-01-01
```
