#### Description

The `list` command reads a JSON array from standard input and prints a human-readable, MUI-List-style view — one block per record. Each block can show an icon, a primary line, a secondary line, and a right-aligned badge label. It is meant for piping the raw JSON output of any aux4 command through a nicer terminal view.

Each of `--icon`, `--primary`, `--secondary`, and `--badge` is a template resolved against the current record using a single, consistent rule:

- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style), so `--secondary date` renders `record.date`. Dot notation is supported for nested fields (`--secondary address.city`). If the record has **no** such field, the whole string is used as a literal constant on every row, so `--icon 😀` prints `😀` on each row and `--badge done` prints `done` on each row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when the field is missing) and the rest of the string is kept literal, so `--primary '$firstName $lastName'` renders the two fields joined by a space.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps aux4's own execute-line `${...}` pre-substitution from ever touching these values. Single-quote the flag in your shell (`--primary '$firstName $lastName'`) so the shell itself does not expand `$field` before aux4 sees it.

**Note:** field lookup takes precedence over the literal fallback. `--icon emoji` uses the `emoji` field when the record has one; only when no `emoji` field exists is the string rendered literally.

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
