# Gutex 1.1.0 Release Notes

## New Features

### --snapshot
Print text at position and exit (no REPL).

```bash
./gutex --snapshot 996 7 36
```

### --raw  
Suppress all metadata in REPL.

```bash
./gutex --raw 996 7 36
```

Flags can be combined and positioned anywhere in the argument list.

## Implementation

- 4 new modules in `lib/`
- 3 new test files
- All original files unchanged except `gutex` entry point
- Tests pass

## Upgrade

Replace your `gutex` executable. That's it.
