#### Description

The `list` command reads a JSON array from standard input and prints a human-readable, MUI-List-style view — one block per record. Each block can show an icon, a primary line, a secondary line, and a right-aligned badge label. It is meant for piping the raw JSON output of any aux4 command through a nicer terminal view.

Each of `--icon`, `--primary`, `--secondary`, and `--badge` is a template resolved against the current record. The forms are tried in order — a value-map (brackets) first, then a named transform (bare colon), then the base bare-field / literal / `$`-interpolation rules:

- **Value-map — `field[VALUE:label,VALUE2:label2,...]`** — look up the record's `field`, then map **its value** through the bracketed table. `--icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]'` picks a per-status emoji; `--secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]'` shows a friendly label. If the record's value is **not** a key in the map, the raw field value is shown unchanged (never blank, never an error). The bracket grammar is the same comma/colon `VALUE:label` grammar used by `render kv` (labels may be quoted).
- **Named transform — `field:transformName`** — apply a built-in transform to the record's `field` value:
  - `case` — snake_case / SCREAMING_SNAKE_CASE → Title Case with spaces (`IN_PROGRESS` → `In Progress`).
  - `date` — parse the value as a timestamp and render the **date** (`Jul 15, 2026`), converted from UTC to the **local machine's timezone**.
  - `time` — same conversion, render the **time** (`10:30 AM`).
  - `datetime` — same conversion, render **date + time** (`Jul 15, 2026, 10:30 AM`).
  - `number` — locale thousands-separator formatting (`12000` → `12,000`).

  Timestamps are assumed to be ISO 8601 with a `Z` suffix or explicit offset, or epoch millis; date/time transforms use the Node runtime's default timezone and locale, never a hardcoded one (a date-only / offset-less string is a known ambiguous case and is not specially handled). If a value can't be parsed for the requested transform, the raw field value is shown unchanged.
- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style), so `--secondary date` renders `record.date`. Dot notation is supported for nested fields (`--secondary address.city`). If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when the field is missing) and the rest of the string is kept literal, so `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps aux4's own execute-line `${...}` pre-substitution from ever touching these values. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally. A value-map always has brackets and a named transform always has a bare colon before a known transform name, so a plain literal (even one containing a colon) is never mistaken for either.

Layout:

- The **icon** (when it resolves to a value) is rendered before the primary text.
- The **badge** label is right-aligned on the primary line to the terminal width (80 columns when the output is not a TTY, e.g. in a pipe). It is plain text, not interactive.
- The **secondary** line is printed beneath, indented to align under the primary text.
- The **primary** text is printed in yellow in a real terminal so it stands out; the icon, secondary, and badge stay uncolored. The plain-text example below does not show the color.
- The **primary** is a single line by design (like MUI's `ListItemText`): when it is too long to fit within the terminal width — after reserving room for the icon prefix and the badge plus a one-space gap when a badge is present — it is truncated with a trailing `…` rather than wrapping to multiple lines. This keeps the badge correctly right-aligned.
- Records are separated by a blank line.

Input handling: a single JSON object is treated as a one-item array; an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

#### Usage

```bash
cat data.json | aux4 render list --primary <template> [--secondary <template>] [--icon <template>] [--badge <template>]
```

--primary    Primary line template (required). Bare field name or `$field` interpolation.
--secondary  Secondary line template. Bare field name or `$field` interpolation.
--icon       Icon template rendered before the primary line.
--badge      Badge label, right-aligned on the primary line (plain text, not interactive).

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
Ada Lovelace                                                              active
Engineer

Linus Torvalds                                                              away
Maintainer
```

Value-map and named transforms — a status-driven icon and label with a formatted timestamp badge:

```bash
echo '[{"title":"Ship release","status":"IN_PROGRESS","createdAt":"2026-07-15T14:30:00Z"}]' \
  | aux4 render list \
      --primary title \
      --icon 'status[TODO:📋,IN_PROGRESS:🔧,DONE:✅]' \
      --secondary 'status[TODO:To Do,IN_PROGRESS:In Progress,DONE:Done]' \
      --badge createdAt:datetime
```

```text
🔧 Ship release                                           Jul 15, 2026, 10:30 AM
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
