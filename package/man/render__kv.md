#### Description

The `kv` command reads a JSON array from standard input and prints one `key=value` (dotenv-style) line per resolved field per record, so a JSON array turns into a flat, greppable list of key/value pairs.

Field selection uses the **same structure grammar** as `render table` / `render csv` / `aux4 2table`:

- **Comma-separated fields** — `name,age,city` selects exactly those top-level fields.
- **Nested groups** — `address[street,city]` flattens to **dotted keys**: `address.street=...` and `address.city=...`.
- **Renaming** — `field:"Label"` (or `field:Label` without quotes) overrides the emitted key name. `address[street:"Street Address"]` emits `Street Address=Main St` — the label replaces the whole key rather than being appended to the dotted path.
- **Bare object field** — selecting a field that holds a nested object without brackets (e.g. just `address`) emits the whole sub-object as a single JSON value (`address={"street":"Main St","city":"NYC"}`).
- **Array-valued fields** — an array (e.g. `tags`) is emitted as a single `JSON.stringify`'d value (`tags=["a","b"]`), never expanded into indexed keys.

Column-width modifiers such as `{width:20}` are accepted but silently ignored, so a structure you also use with `table` or `csv` can be pasted unchanged.

If the structure argument is **omitted**, every field of each record is auto-flattened recursively into dotted keys — nested objects are walked to produce dotted paths, while arrays are emitted as a single JSON value.

Input handling: a single JSON object is treated as a one-item array; an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

#### Usage

```bash
cat data.json | aux4 render kv [<structure>]
```

structure  Optional. Comma-separated field structure (`field`, `field[sub1,sub2]`, `field:"Label"`). Omit to auto-flatten every field into dotted keys.

#### Example

Input (`person.json`):

```json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC" }, "tags": ["a", "b"] }
]
```

Explicit structure with a nested group and a rename:

```bash
cat person.json | aux4 render kv 'name,address[street,city:"City"]'
```

```text
name=Alice
address.street=Main St
City=NYC
```

No structure — auto-flatten every field:

```bash
cat person.json | aux4 render kv
```

```text
name=Alice
address.street=Main St
address.city=NYC
tags=["a","b"]
```
