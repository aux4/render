#### Description

The `yaml` command reads a JSON array from standard input and prints it as YAML, so a JSON payload turns into a readable, nesting-preserving document. It shares the **same structure grammar** as `render kv` for selecting fields — but unlike `kv`, which flattens the selection into dotted `key=value` lines, `yaml` **preserves the nesting** in the output.

Field selection uses the same grammar as `render kv` / `render table` / `render csv` / `aux4 2table`:

- **Comma-separated fields** — `name,age,city` selects exactly those top-level fields.
- **Nested groups** — `address[street,city]` produces a nested `address:` mapping with `street` and `city` under it (**not** flat `address.street` / `address.city` keys, as `kv` would emit).
- **Renaming** — `field:"Label"` (or `field:Label` without quotes) overrides the emitted key name. `address[street,city:"City"]` emits a `City:` key inside the nested `address` mapping.
- **Array of objects** — when a selected `field[...]` group is applied to an array, each element is projected through the group, producing a YAML sequence of nested mappings.

Column-width modifiers such as `{width:20}` are accepted but silently ignored, so a structure you also use with `table`, `csv`, or `kv` can be pasted unchanged.

If the structure argument is **omitted**, the full original record is dumped as-is with no filtering. There is no flattening step — YAML already represents nested structure natively.

**Single vs. multiple records** — a single record (a lone JSON object, a one-element array, or a record picked with `--index N`) is dumped as a single YAML **mapping**. Multiple records are dumped as a YAML **sequence** of mappings; no index prefixing is needed because a YAML sequence already disambiguates records.

**`--index <N>`** — an optional 0-based index selecting a **single** record from the top-level array before serialization. The selected record is rendered as a single YAML mapping, and composes with an explicit structure argument. An out-of-range index (`N` ≥ record count, or `N` < 0) or a non-integer value prints a clear error to stderr and exits `1`. Omit it (or pass an empty value) to render every record.

Input handling: a single JSON object is treated as a one-item array; an empty array (`[]`) prints nothing and exits `0`; invalid/non-JSON input prints a clear error to stderr and exits `1`.

#### Usage

```bash
cat data.json | aux4 render yaml [<structure>] [--index <N>]
```

structure  Optional. Comma-separated field structure (`field`, `field[sub1,sub2]`, `field:"Label"`) — the selection stays nested in the YAML output. Omit to dump the full record.
--index    Optional. 0-based index selecting a single record from the top-level array, rendered as a single YAML mapping. Out of range exits 1.

#### Example

Input (`person.json`):

```json
[
  { "name": "Alice", "address": { "street": "Main St", "city": "NYC", "zip": "10001" } }
]
```

Explicit structure with a nested group and a rename (nesting preserved, `zip` dropped):

```bash
cat person.json | aux4 render yaml 'name,address[street,city:"City"]'
```

```text
name: Alice
address:
  street: Main St
  City: NYC
```

No structure — dump the full record:

```bash
cat person.json | aux4 render yaml
```

```text
name: Alice
address:
  street: Main St
  city: NYC
  zip: '10001'
```

Multiple records — dumped as a YAML sequence:

```bash
echo '[{"name":"Alice"},{"name":"Bob"}]' | aux4 render yaml
```

```text
- name: Alice
- name: Bob
```

Select a single record with `--index` (rendered as a single mapping):

```bash
echo '[{"name":"Alice"},{"name":"Bob"}]' | aux4 render yaml --index 1
```

```text
name: Bob
```
