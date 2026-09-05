# Tasks

The commands a project actually runs, declared in the project.

```json
// <root>/.chevron/tasks.json
{
  "tasks": [
    { "name": "test", "command": "npm test" },
    { "name": "build", "command": "make", "cwd": "packages/core" }
  ]
}
```

`Tasks: Run` (`ctrl-shift-b`) lists them and runs the one you pick in a
terminal pane titled with its name.

Beside `.chevron/config.json`, read the same way: a file people commit, that
the editor never writes.

---

## Running one needs the folder to be trusted

A tasks file arrives **with the repository**. Executing it on the strength of
having opened the folder would turn cloning into running, which is the
scenario the trust prompt already exists for — trusting a folder is what lets
a language server load that project's toolchain.

So:

- **discovery is free** — the tasks are listed whatever the trust state, and
  reading a file is not running it
- **running is not** — an untrusted folder gets a warning naming the task, and
  nothing is spawned

Grant trust the usual way (`Chevron Lsp: Trust Project`); the store is shared,
not per-feature.

## A task is a command line

Not a binary and a list of arguments. `npm test && npm run lint` has to mean
what it says, so the command is handed to your shell — `-lc` on POSIX,
`/d /s /c` on Windows — which is also why PATH and aliases are the ones you
have in a terminal.

The shell itself is an absolute path, which is what the pty host requires; it
comes from `terminal.shell` or `$SHELL`.

## What a tasks file may not do

Checked in `src/tasks.ts`, gated in `script/ci/tasks.test.js`:

| Rule | Why |
|------|-----|
| `cwd` resolves **inside** the root | A task running elsewhere walks around the trust decision made about this folder |
| names are unique | Two tasks called `test` and no way to say which you meant; the first stands and the clash is reported |
| no NUL in any string | It truncates a string somewhere below this |
| names ≤ 100 chars, commands ≤ 4096 | A label is a label |

A malformed file **reports what it could not use and keeps going**. A
`tasks.json` somebody is halfway through editing must not take the command
palette down with it, so parsing never throws and every dropped entry comes
back with a reason.

## Where it runs

Through the same pty host as the terminal
([terminal.md](terminal.md)) — the renderer never spawns anything, and the
host validates the shell, the arguments and the working directory again on its
own side.

## Gates

| Test | Covers |
|------|--------|
| `script/ci/tasks.test.js` | parsing, the path-escape rules, malformed files, and the shell invocation per platform |
| `script/ci/smoke-test.js` | the task is discovered in an untrusted project, and running it is refused with nothing spawned |

The trusted path — picker, confirm, a terminal titled with the task showing
its output — was verified by driving the packaged app directly. It is not in
the smoke test because granting trust there would mean writing the trust store
from the harness, which would make the untrusted case, the one that matters,
harder to assert.
