#### Description

The `list` command reads a JSON array from standard input and prints a human-readable, MUI-List-style view — one block per record. Each block can show an icon, a primary line, a secondary line, and a right-aligned badge label. It is meant for piping the raw JSON output of any aux4 command through a nicer terminal view.

Each of `--icon`, `--primary`, `--secondary`, and `--badge` is a template resolved against the current record. The forms are tried in order — a value-map (brackets) first, then a value-format (braces), then the base bare-field / literal / `$`-interpolation rules:

- **Value-map — `field[VALUE:label,VALUE2:label2,...]`** — look up the record's `field`, then map **its value** through the bracketed table. `--icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'` picks a per-status emoji; `--secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'` shows a friendly label. If the record's value is **not** a key in the map, the raw field value is shown unchanged (never blank, never an error). The bracket grammar is the same comma/colon `VALUE:label` grammar used by `render kv` (labels may be quoted).
- **Value-format — `field{format:TYPE,option:value,...}`** — render the record's `field` value through the shared value formatter (vendored from `aux4/2table`):
  - Types: `number` (grouped number), `currency` (ISO code, default `USD`), `percent` (value treated as a ratio), `date`, `time`, `datetime`.
  - Option keys: `decimals`, `currency`, `locale`, and the unified temporal `style` (`short|medium|long|full`) plus `dateStyle`/`timeStyle` per-part overrides.
  - `--badge 'price{format:currency,currency:USD}'` → `$1,234.50`; `--secondary 'createdAt{format:datetime}'` → a localized date+time.
  - Empty values render empty; values that cannot be parsed for the requested type fall back to the raw field value unchanged (never `NaN`/`Invalid Date`).

  **Breaking change:** value-format **replaces** the old `field:transform` colon syntax. `field:number`, `field:date`, `field:case`, etc. are no longer transforms — a bare colon is treated as a literal now (so `--secondary count:number` prints the literal `count:number`). Use `field{format:number}` / `field{format:date}` instead. There is no replacement for the old `case` transform.
- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style), so `--secondary date` renders `record.date`. Dot notation is supported for nested fields (`--secondary address.city`). If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when the field is missing) and the rest of the string is kept literal, so `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps aux4's own execute-line `${...}` pre-substitution from ever touching these values. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally. A value-map always has brackets and a value-format always has braces (`{format:...}`), so a plain literal (even one containing a colon) is never mistaken for either.

Layout:

- Every line starts with a single leading space (a left gutter), so `list` output visually aligns with `aux4/2table` (and `render table`/`render csv`, which delegate to it). The badge right-edge math accounts for this gutter, so the badge still lands flush at the terminal width.
- The **icon** (when it resolves to a value) is rendered before the primary text.
- The **badge** label is right-aligned on the primary line to the terminal width (80 columns when the output is not a TTY, e.g. in a pipe). It is plain text, not interactive.
- The **secondary** line is printed beneath, indented to align under the primary text.
- The **primary** text is printed in yellow in a real terminal so it stands out; the icon, secondary, and badge stay uncolored. The plain-text example below does not show the color.
- The **primary** is a single line by design (like MUI's `ListItemText`): when it is too long to fit within the terminal width — after reserving room for the icon prefix and the badge plus a one-space gap when a badge is present — it is truncated with a trailing `…` rather than wrapping to multiple lines. This keeps the badge correctly right-aligned.
- Records are separated by a blank line.

Input handling: a single JSON object is treated as a one-item array; **NDJSON** (one JSON object per line) is auto-detected when stdin is not a single JSON document (blank lines ignored, a bad line errors with its 1-based line number and exits `1`); an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

With `--inputStream`, stdin is read line-by-line (NDJSON) and each record is rendered **live as it arrives**, never waiting for EOF — for example `tail -f events.ndjson | aux4 render list --inputStream --primary title`. Each record is an independent block with the same formatting as batch mode.

#### Usage

```bash
cat data.json | aux4 render list --primary <template> [--secondary <template>] [--icon <template>] [--badge <template>] [--inputStream <true|false>]
```

--primary    Primary line template (required). Bare field name or `$field` interpolation.
--secondary  Secondary line template. Bare field name or `$field` interpolation.
--icon       Icon template rendered before the primary line.
--badge      Badge label, right-aligned on the primary line (plain text, not interactive).
--inputStream     Stream stdin line-by-line (NDJSON) and render each record live as it arrives (default: false).

#### Example

Input (`people.json`):

```json
[
  { "firstName": "Ada", "lastName": "Lovelace", "role": "Engineer", "status": "active" },
  { "firstName": "Linus", "lastName": "Torvalds", "role": "Maintainer", "status": "away" }
]
```

```bash
cat people.json | aux4 render list --primary '$firstName $lastName' --secondary role --badge status
```

```text
 Ada Lovelace                                                             active
 Engineer

 Linus Torvalds                                                             away
 Maintainer
```

Value-map and value-format — a status-driven icon and label with a formatted timestamp badge:

```bash
echo '[{"title":"Ship release","status":"IN_PROGRESS","createdAt":"2026-07-15T14:30:00Z"}]' \
  | aux4 render list \
      --primary title \
      --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]' \
      --secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]' \
      --badge 'createdAt{format:datetime,locale:en-US}'
```

```text
 🔧 Ship release                                          Jul 15, 2026, 10:30 AM
    In Progress
```

An unmapped value falls back to the raw field value:

```bash
echo '[{"title":"Investigate outage","status":"BLOCKED"}]' \
  | aux4 render list --primary title --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'
```

```text
 BLOCKED Investigate outage
```

Consume an append-only NDJSON stream live (each line renders as it arrives):

```bash
tail -f events.ndjson | aux4 render list --inputStream --primary title --secondary message
```
