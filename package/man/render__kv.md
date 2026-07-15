#### Description

The `kv` command reads a JSON array from standard input and prints one `key=value` (dotenv-style) line per record. For every record it resolves a `--key` template and a `--value` template and joins them with `=`, so a JSON array turns into a flat, greppable list of key/value pairs.

Both `--key` and `--value` are resolved against the current record using the same single, consistent rule as `render list`'s template flags:

- **No `$` in the value** — if the record has a field with that name, the field's value is used (2table-style), so `--key name` uses `record.name`. Dot notation is supported for nested fields (`--key meta.id`). If the record has **no** such field, the whole string is used as a literal constant on every row.
- **One or more `$field` tokens** — each `$field` is replaced with that record field (empty string when the field is missing) and the rest of the string is kept literal, so `--value '$host:$port'` renders the two fields joined by a colon.

The tokens are deliberately bare `$field`, **not** `${...}`. This keeps aux4's own execute-line `${...}` pre-substitution from ever touching these values. Single-quote the flag in your shell (`--value '$host:$port'`) so the shell itself does not expand `$field` before aux4 sees it.

Both `--key` and `--value` are **required**. If either is omitted the command fails immediately with a clear error on stderr and exits `2` (it does not prompt, which would consume the piped stdin).

Input handling: a single JSON object is treated as a one-item array; an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

#### Usage

```bash
cat data.json | aux4 render kv --key <template> --value <template>
```

--key    Key template (required). Bare field name or `$field` interpolation.
--value  Value template (required). Bare field name or `$field` interpolation.

#### Example

Input (`settings.json`):

```json
[
  { "name": "HOST", "val": "localhost" },
  { "name": "PORT", "val": "3000" }
]
```

```bash
cat settings.json | aux4 render kv --key name --value val
```

```text
HOST=localhost
PORT=3000
```

Interpolated value:

```bash
cat servers.json | aux4 render kv --key name --value '$host:$port'
```

```text
web=localhost:3000
db=db.example.com:5432
```
