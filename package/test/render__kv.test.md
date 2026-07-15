# render kv

## plain field mode

### should render key=value using bare field names

```file:settings.json
[
  { "name": "HOST", "val": "localhost" },
  { "name": "PORT", "val": "3000" }
]
```

```execute
cat settings.json | aux4 render kv --key name --value val
```

```expect
HOST=localhost
PORT=3000
```

## interpolation mode

### should replace $field tokens in key and value

```file:servers.json
[
  { "id": "web", "host": "localhost", "port": "3000" },
  { "id": "db", "host": "db.example.com", "port": "5432" }
]
```

```execute
cat servers.json | aux4 render kv --key '$id' --value '$host:$port'
```

```expect
web=localhost:3000
db=db.example.com:5432
```

## missing key

### should fail with a clear error and exit 2 when --key is omitted

When no `--key` is given, the command must not prompt (which would eat the piped JSON) — it invokes the script, which fails immediately with an error on stderr and a non-zero exit.

```file:settings.json
[
  { "name": "HOST", "val": "localhost" }
]
```

```execute
cat settings.json | aux4 render kv --value val; echo "exit=$?"
```

```expect
exit=2
```

```error:partial
No --key field provided. Use --key <field>.
```

## missing value

### should fail with a clear error and exit 2 when --value is omitted

```file:settings.json
[
  { "name": "HOST", "val": "localhost" }
]
```

```execute
cat settings.json | aux4 render kv --key name; echo "exit=$?"
```

```expect
exit=2
```

```error:partial
No --value field provided. Use --value <field>.
```

## empty array

### should print nothing and exit 0 for an empty array

```execute
echo '[]' | aux4 render kv --key name --value val; echo "exit=$?"
```

```expect
exit=0
```

## single object

### should treat a single object as a one-item array

```execute
echo '{"name":"HOST","val":"localhost"}' | aux4 render kv --key name --value val
```

```expect
HOST=localhost
```

## invalid json

### should fail with a clear error and exit 1 on non-JSON stdin

```execute
echo 'not json' | aux4 render kv --key name --value val; echo "exit=$?"
```

```expect
exit=1
```

```error:partial
Invalid JSON on stdin: *?
```
