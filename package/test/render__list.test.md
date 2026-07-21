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

Every line carries a single leading-space gutter (matching 2table/table/csv), so the badge right-aligns to width 80 within the remaining 79-column content area: after the 1-space gutter and the 5-column primary `Alice`, 68 spaces precede the 6-column badge `active`.

```file:people.json
[
  { "name": "Alice", "status": "active" }
]
```

```execute
cat people.json | aux4 render list --primary name --badge status
```

```expect:regex
^ Alice {68}active$
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
^ Alice {70}done$
```

## long primary

### should truncate an overlong primary with an ellipsis and keep the badge right-aligned

When the primary text is longer than the available width, it is truncated with a trailing `…` so the badge still right-aligns to width 80. Every line carries a 1-space leading gutter (matching 2table/table/csv), leaving 79 columns of content. Here the badge `done` reserves 5 columns (4 + one gap), leaving 74 for the primary: 73 characters survive plus the ellipsis, then the gutter prefixes the whole line.

```file:long.json
[
  { "title": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "status": "done" }
]
```

```execute
cat long.json | aux4 render list --primary title --badge status
```

```expect:regex
^ x{73}… done$
```

### should truncate an overlong primary with an ellipsis when there is no badge

Without a badge the primary is truncated to fit the full width (80 columns). Every line carries a 1-space leading gutter (matching 2table/table/csv), leaving 79 columns of content: 78 characters survive plus the ellipsis, then the gutter prefixes the line.

```file:long.json
[
  { "title": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

```execute
cat long.json | aux4 render list --primary title
```

```expect:regex
^ x{78}…$
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

The badge label `Done` (4 columns) is right-aligned to width 80. With the 1-space leading gutter (matching 2table/table/csv) the content area is 79 columns, so 68 spaces follow the 7-column primary `Ship it`.

```execute
echo '[{"title":"Ship it","status":"DONE"}]' | aux4 render list --primary title --badge 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'
```

```expect:regex
^ Ship it {68}Done$
```

## value format

A `field{format:...}` template renders the record's field value through the shared
formatter (vendored from aux4/2table): types `number`, `currency`, `percent`,
`date`, `time`, `datetime`; option keys `decimals`, `currency` (ISO, default USD),
`locale`, and the unified temporal `style` (`short|medium|long|full`) plus
`dateStyle`/`timeStyle` overrides. Tests pin `locale:en-US` and run under `TZ=UTC`
for determinism.

**Breaking change:** this REPLACES the old `field:transform` colon syntax.
`field:number`, `field:date`, `field:case`, etc. are no longer transforms — a bare
colon is treated as a literal now (see the resolution regressions below). Use
`field{format:number}` / `field{format:date}` instead. There is no replacement for
the old `case` transform.

### should format a currency value in a badge

```execute
echo '[{"name":"Widget","price":1234.5}]' | TZ=UTC aux4 render list --primary name --badge 'price{format:currency,currency:USD,locale:en-US}'
```

```expect:regex
^.*Widget.* \$1,234\.50$
```

### should render a date via the style key in the secondary line

```execute
echo '[{"title":"T","born":"1990-05-01"}]' | TZ=UTC aux4 render list --primary title --secondary 'born{format:date,style:long,locale:en-US}'
```

```expect:partial
May 1, 1990
```

### should render a datetime in the secondary line

```execute
echo '[{"title":"T","createdAt":"2026-07-15T02:30:00Z"}]' | TZ=UTC aux4 render list --primary title --secondary 'createdAt{format:datetime,locale:en-US}'
```

```expect:partial
Jul 15, 2026, 2:30 AM
```

### should format a number with locale thousands separators

```execute
echo '[{"title":"T","count":12000}]' | TZ=UTC aux4 render list --primary title --secondary 'count{format:number,locale:en-US}'
```

```expect:partial
12,000
```

### should fall back to the raw value when a date cannot be parsed

```execute
echo '[{"title":"T","createdAt":"not-a-date"}]' | TZ=UTC aux4 render list --primary title --secondary 'createdAt{format:date,locale:en-US}'
```

```expect:partial
not-a-date
```

### should fall back to the raw value when a number cannot be parsed

```execute
echo '[{"title":"T","count":"N/A"}]' | TZ=UTC aux4 render list --primary title --secondary 'count{format:number,locale:en-US}'
```

```expect:partial
N/A
```

## resolution regressions

### should treat a literal containing a colon as a literal (colon is no longer a transform)

`Status: unknown` has no brackets and no `{format:...}` modifier, so it falls through to the literal rule unchanged.

```execute
echo '[{"title":"T"}]' | aux4 render list --primary title --secondary 'Status: unknown'
```

```expect
 T
 Status: unknown
```

### should treat the old field:transform colon syntax as a literal (BREAKING CHANGE)

Before, `count:number` applied a number transform. It is no longer special: with no field named `count:number` on the record, the whole string is rendered as a literal. Use `count{format:number}` for formatting.

```execute
echo '[{"title":"T","count":12000}]' | aux4 render list --primary title --secondary count:number
```

```expect
 T
 count:number
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
