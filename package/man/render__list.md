#### Description

The `list` command reads a JSON array from standard input and prints a human-readable, MUI-List-style view — one block per record. Each block can show an icon, a primary line, a secondary line, and a right-aligned actions label. It is meant for piping the raw JSON output of any aux4 command through a nicer terminal view.

Each of `--icon`, `--primary`, `--secondary`, and `--actions` is a template resolved against the current record using a single, consistent rule:

- **No `$` in the value** — the whole string is treated as a bare field name (2table-style), so `--secondary date` renders `record.date`. Dot notation is supported for nested fields (`--secondary address.city`).
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when the field is missing) and the rest of the string is kept literal, so `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps aux4's own execute-line `${...}` pre-substitution from ever touching these values. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** because a value with no `$` is always looked up as a field name, a literal constant icon such as `--icon 👤` is treated as the field named `👤` (which is normally absent, so no icon shows). To render an icon per row, point `--icon` at a field that holds the glyph (for example `--icon emoji`).

Layout:

- The **icon** (when it resolves to a value) is rendered before the primary text.
- The **actions** label is right-aligned on the primary line to the terminal width (80 columns when the output is not a TTY, e.g. in a pipe). It is plain text, not interactive.
- The **secondary** line is printed beneath, indented to align under the primary text.
- Records are separated by a blank line.

#### Usage

```bash
cat data.json | aux4 render list --primary <template> [--secondary <template>] [--icon <template>] [--actions <template>]
```

--primary    Primary line template (required). Bare field name or `$field` interpolation.
--secondary  Secondary line template. Bare field name or `$field` interpolation.
--icon       Icon template rendered before the primary line.
--actions    Actions label, right-aligned on the primary line (plain text, not interactive).

#### Example

Input (`people.json`):

```json
[
  { "firstName": "Ada", "lastName": "Lovelace", "role": "Engineer", "status": "active" },
  { "firstName": "Linus", "lastName": "Torvalds", "role": "Maintainer", "status": "away" }
]
```

```bash
cat people.json | aux4 render list --primary '$firstName $lastName' --secondary role --actions status
```

```text
Ada Lovelace                                                              active
Engineer

Linus Torvalds                                                              away
Maintainer
```
