#### Description

The `kv` command reads a JSON array from standard input and prints one `key=value` (dotenv-style) line per resolved field per record, so a JSON array turns into a flat, greppable list of key/value pairs.

Field selection uses the **same structure grammar** as `render table` / `render csv` / `aux4 2table`:

- **Comma-separated fields** — `name,age,city` selects exactly those top-level fields.
- **Nested groups** — `address[street,city]` flattens to **dotted keys**: `address.street=...` and `address.city=...`.
- **Renaming** — `field:"Label"` (or `field:Label` without quotes) overrides the emitted key name. `address[street:"Street Address"]` emits `Street Address=Main St` — the label replaces the whole key rather than being appended to the dotted path.
- **Bare object field** — selecting a field that holds a nested object without brackets (e.g. just `address`) emits the whole sub-object as a single JSON value (`address={"street":"Main St","city":"NYC"}`).
- **Value formatting — `field{format:TYPE,option:value,...}`** — render the field's value through the shared value formatter (vendored from `aux4/2table`). Types: `number`, `currency`, `percent`, `date`, `time`, `datetime`. Option keys: `decimals`, `currency` (ISO code, default `USD`), `locale`, and the unified temporal `style` (`short|medium|long|full`) plus `dateStyle`/`timeStyle` overrides. `price{format:currency,currency:USD}` emits `price=$1,234.50`. Empty/un-parseable values fall back to the raw value (never `NaN`/`Invalid Date`). Commas inside the braces stay grouped, so `field{format:currency,currency:USD}` is not split on its inner comma. A formatted leaf is emitted as a single pair (array index-flattening is skipped for it).

Column-width modifiers such as `{width:20}` (a brace modifier without a `format:` key) are accepted but silently ignored, so a structure you also use with `table` or `csv` can be pasted unchanged.

If the structure argument is **omitted**, every field of each record is auto-flattened recursively into dotted keys — nested objects are walked to produce dotted paths.

**Array flattening** — arrays are flattened uniformly at every level (including the top-level array of records) into **indexed dotted keys**, using each element's position as a path segment:

- A nested array field `tags: ["a", "b"]` becomes `tags.0=a`, `tags.1=b`. A single-element array is still indexed (`tags.0=a`) — an array is structurally an array regardless of length.
- Arrays of arrays recurse the same way: `matrix: [[1, 2], [3, 4]]` becomes `matrix.0.0=1`, `matrix.0.1=2`, `matrix.1.0=3`, `matrix.1.1=4`.
- When the top-level array holds **more than one** record, each record's keys are prefixed with its 0-based index (`0.name=Alice`, `1.name=Bob`), so record boundaries are unambiguous.
- **Exception:** a single record gets **no** index prefix — a lone JSON object, a one-element array, or a record picked with `--index N` is treated as *the* record (`name=Alice`, not `0.name=Alice`).

**`--index <N>`** — an optional 0-based index selecting a **single** record from the top-level array before the rest of the pipeline runs (structure selection, flattening, output). The selected record is rendered on its own with no index prefix, and composes with an explicit structure argument. An out-of-range index (`N` ≥ record count, or `N` < 0) or a non-integer value prints a clear error to stderr and exits `1`. Omit it (or pass an empty value) to render every record.

Input handling: a single JSON object is treated as a one-item array; an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

#### Usage

```bash
cat data.json | aux4 render kv [<structure>] [--index <N>]
```

structure  Optional. Comma-separated field structure (`field`, `field[sub1,sub2]`, `field:"Label"`, `field{format:TYPE,...}`). Omit to auto-flatten every field into dotted keys.
--index    Optional. 0-based index selecting a single record from the top-level array, rendered with no index prefix. Out of range exits 1.

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

No structure — auto-flatten every field (arrays become indexed keys):

```bash
cat person.json | aux4 render kv
```

```text
name=Alice
address.street=Main St
address.city=NYC
tags.0=a
tags.1=b
```

Multiple records — each record is prefixed with its 0-based index:

```bash
echo '[{"name":"Alice","tags":["a","b"]},{"name":"Bob","tags":["c"]}]' | aux4 render kv
```

```text
0.name=Alice
0.tags.0=a
0.tags.1=b
1.name=Bob
1.tags.0=c
```

Select a single record with `--index` (rendered with no prefix):

```bash
echo '[{"name":"Alice","tags":["a","b"]},{"name":"Bob","tags":["c"]}]' | aux4 render kv --index 1
```

```text
name=Bob
tags.0=c
```

Format values with `field{format:...}`:

```bash
echo '[{"name":"Widget","price":1234.5,"rate":0.2}]' | aux4 render kv 'name,price{format:currency,currency:USD,locale:en-US},rate{format:percent,decimals:0,locale:en-US}'
```

```text
name=Widget
price=$1,234.50
rate=20%
```
