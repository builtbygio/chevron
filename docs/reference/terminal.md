# Terminal

A shell in a pane. Three layers, and only one of them is ours — the split is
the decision recorded in
[next-tracks-plan.md](../process/next-tracks-plan.md), track 3.

| Layer | What | Where |
|-------|------|-------|
| Emulation and rendering | `@xterm/xterm` 6.0.0 | `packages/terminal/lib/terminal-view.js` |
| Pseudoterminal | `node-pty` 1.1.0 | `src/main-process/workers/pty-host.js` |
| Panes, commands, lifecycle | written here | `packages/terminal` |

---

## Where the spawning happens

Not in the renderer. A terminal starts arbitrary processes, which is the thing
the FS IPC roots, the privileged-require restriction and the trust prompt all
exist to contain; a renderer that could spawn shells would walk around all
three, and the model would be decorative.

So it is built like the LSP host and the git workers:

```
packages/terminal  ──►  chevron.pty  ──►  chevron:pty-*  ──►  pty host
   xterm view          src/pty-client   register-pty-ipc    utilityProcess
                                          (validates)        (spawns)
```

The renderer holds a view and a data channel. Main decides. The host spawns.

## What main checks before spawning

Every one of these is a gate in `script/ci/pty-ipc.test.js`, because they are
the feature rather than paperwork around it:

- **shell** — an absolute path to a file that exists
- **args** — nul-free strings, or absent
- **cwd** — a project root of *that window*, or the user's home, and a real
  directory. A terminal that can start anywhere makes the FS IPC roots
  meaningless
- **cols / rows** — integers between 1 and 5000
- **env** — only `LANG`, `LC_ALL` and `COLORTERM` reach the shell. Arbitrary
  environment is how a terminal becomes a way to reconfigure the process it
  spawns (`LD_PRELOAD`, `NODE_OPTIONS`)

A session belongs to the window that asked for it: another window cannot write
to it, resize it or kill it, and a window closing takes its shells with it.

## What it does not do yet

**Sessions do not survive a reload.** A pty is a process; a restored pane
starts a fresh shell in the same directory rather than pretending otherwise.

**There is no permission gate on individual commands, and no transcript.**
Those belong to the agent-facing terminal, which the plan is explicit is a
different product from a human one — an agent-drivable terminal needs a
readable transcript, a prompt per command, and state that survives a reload.
This is the human one.

## Building it

`node-pty` is on the critical natives list in both places that list has to be
kept aligned — `script/lib/natives-fingerprint.js` and `script/bootstrap-modern`
— because **there is no Linux prebuild**. macOS and Windows get prebuilt
binaries; Linux builds from source, like the other criticals.

Packaging unpacks `node_modules/node-pty/build/Release/**` and `prebuilds/**`
from the asar. The bare `*.node` glob is not enough: on macOS node-pty execs a
`spawn-helper` binary beside the `.node`, rewriting its own path from
`app.asar` to `app.asar.unpacked`, and a helper still inside the archive is a
terminal that opens and immediately dies — on macOS only.

### Adding a dependency to this repo

Worth knowing before you run `pnpm add` for anything: bootstrap materialises
`superstring` and `@atom/watcher` **over** pnpm's workspace symlinks, and an
install puts the symlinks back. The build then fails copying assets, with an
`ENOENT` naming a nested module that has nothing to do with what you added.
The repair is what bootstrap does:

```bash
. script/lib/force-patched-superstring.sh
chevron_force_patched_natives "$PWD"
# rebuild superstring and @atom/watcher for Electron, then:
chevron_resync_nested_built_natives "$PWD"
```

## Gates

| Test | Covers |
|------|--------|
| `script/ci/pty-ipc.test.js` | what may be asked for, and who may drive a session |
| `script/ci/pty-host-integration.test.js` | the host protocol against a real shell, forked outside Electron |
| `script/ci/smoke-test.js` | a terminal in the packaged app running a command and showing its output |

The three are deliberately different failures. The validators can all pass
while the host reads nothing (#309 was exactly that), and the host can be
perfect while the native fails to load out of an asar.
