# Next tracks — profiler, per-root config, and the agent host

**Status: open.** Scoping only; no code has moved. Three tracks in the order
they should happen, and why that order: each one makes the next cheaper.

A fourth — remote editing over SSH — was scoped and then **dropped** (owner,
2026-09-04). §4 keeps the costing, because the question will come back and the
answer should not have to be re-derived.

The long-term goal this serves: **Chevron as a host for coding agents** — an
editor where an agent is a first-class participant with project context, not a
chat window bolted on. Track 3 is the first commitment to it; tracks 1 and 2
are useful regardless and happen to be prerequisites.

---

## Why this order

| # | Track | Why here |
|---|-------|----------|
| 1 | Package profiler | Cheapest, and you cannot tell whether an agent is making the editor slow without it |
| 2 | Per-root config | Small, and multi-root is a precondition for "agent works across my repos" |
| 3 | Agent host protocol | The actual goal; needs 1 to measure and 2 to know what "the project" means |
| ~~4~~ | ~~Remote over SSH~~ | **Dropped** — see §4 for what it would have cost |

---

## Track 1 — A real package profiler

### What exists

`timecop` still ships, and it reports exactly two numbers per package:
`loadTime` and `activateTime`, taken from `PackageManager#measure` calls in
`src/package.js`. That is the Atom-era answer: it tells you what boot cost, and
nothing about what the package costs you afterwards.

Better instrumentation already exists elsewhere: **20 `StartupTime.addMarker`
call sites**, `script/ci/measure-startup.js`, the deferred-activation gates, and
`docs/reference/startup-measurement-2026-09.md`.

### What is missing

Ongoing cost. A package that activates in 4 ms and then runs a handler on every
keystroke, observes every buffer change, or churns marker layers is invisible
today. That is the cost that actually makes an editor feel slow, and it is the
cost an agent will add most of.

### Shape

Instrument the four places a package can spend the user's time, all of which
core already owns and can wrap per package:

- **command handlers** — `CommandRegistry` knows which package registered each
- **event subscriptions** — `Emitter`/`CompositeDisposable` callbacks
- **marker layer churn** — decorations created and destroyed per edit
- **IPC** — how many `atom-fs-*` / `lsp:*` / `rg:*` round trips, and their wait

Report as a per-package table with p50/p95 and a call count, not a total: a
package doing 3 ms of work 400 times is the interesting case, and a mean hides
it. `timecop` becomes the view; the measurement belongs in core beside
`StartupTime`.

**Cost:** days, not weeks. **Risk:** the instrumentation itself must be cheap —
measure with counters and sampled timings, not a wrapper on every call.
**Gate:** a CI check that the profiler's own overhead stays under a threshold on
the smoke probe.

---

## Track 2 — Multi-root workspaces with per-root config

### What exists

More than it looks. Multi-root is already real: `Project#getPaths()`,
`setPaths`, `onDidChangePaths`, and roots reach main via `setProjectRoots` —
the FS IPC strict-roots layer already thinks in terms of a set of roots.

Project config exists too, but **singular**: `Config#resetProjectSettings(settings, projectFile)`
sets `this.projectFile` to one path and pushes settings into
`scopedSettingsStore` under that one source (`src/project.js:106`). The store
is already keyed by source and already supports several; the editor only ever
gives it one.

### What is missing

`projectFile` becomes a map of root → source, and resolution picks the source
by the file's root. The storage layer needs nothing new.

### The real design question

**Precedence.** Root config vs user config vs language scope, and what a file
outside every root gets. This is where it goes wrong: settings that resolve
differently depending on which root a file happens to sit under, with no way to
see why. Write the precedence table first, then the code, and expose "where did
this value come from" — the store knows the source, so the answer is available.

**Cost:** a week, most of it on precedence and its tests. **Gate:** a matrix
test over (user, root A, root B, scope) asserting the resolved value and its
source for each combination.

---

## Track 3 — An agent host protocol

### The claim

Chevron has an unusual amount of what an agent host needs, because of the
security work, not in spite of it:

| Primitive | Where it already is |
|-----------|--------------------|
| Semantic context out of process | LSP host in a `utilityProcess` (#309 made it actually work) |
| Fast search | `ripgrep` spawned from main, allowlisted |
| Git out of process | `utilityProcess` git workers |
| A trust model | project trust already gates whether language servers may run |
| A permission boundary | FS IPC strict roots, privileged-require restriction, openExternal allowlist |

Agent hosting is mostly a **permissions and provenance** problem: what may this
thing read, what may it run, what may it change, and how does a human see and
undo it. That is the same problem Phase N and Phase S already solved for
packages and language servers.

### What is missing, and it is all the human's half

- ~~a **diff review** surface: propose, show, accept per hunk, undo as one
  step~~ — **shipped** ([change-review.md](../reference/change-review.md)).
  `chevron.review.propose()` over `chevron.changeProposal`, applied in one
  transaction. Conflict detection, for a file that changes between proposal
  and apply, is the next thing it needs
- **task state that survives reload** — the reload path is well understood now
  (#308), and an agent's work must not die with a window
- a **terminal**. There is no terminal package in the tree at all — decided
  below
- **permission prompts** for tool calls, in the shape the trust modal already has
- **per-session context**: what the agent has read, and why

### Do not fork the agent

This repo has measured what forks cost: `script/audit-fork-drift.js` exists
because **29 of 83 owned forks had drifted**, several of them silently
reverting shipped work. A fast-moving agent runtime is the worst possible thing
to carry as a fork, and the agent loop is the commodity half — models change
monthly and harnesses converge.

**Fork the integration, not the runtime.** Define a protocol where an agent
process asks the editor for context and proposes edits, and the editor owns
trust, review and undo. Run it as a `utilityProcess`, exactly like the LSP host
— that shape is proven here, including how it fails. OpenCode then becomes a
*client*: upgradeable by bumping a version, and a second agent costs nothing
architecturally.

### The terminal: adopt two layers, write the third

There is no terminal in the catalog, and an agent host needs one. "Custom or
off-the-shelf" is three questions, and they have different answers.

| Layer | Decision | Why |
|-------|----------|-----|
| Emulation + rendering | **adopt `@xterm/xterm@6.0.0`** | zero dependencies, actively published, and what VS Code and Hyper use. Writing a VT emulator means xterm escape sequences, mouse reporting, bracketed paste, unicode width and reflow — a twenty-year tail with no upside |
| PTY | **adopt `node-pty@1.1.0`** | N-API (`node-addon-api`) and **28 prebuilt binaries** shipped, including `win32-arm64` ConPTY. That is the property that let the markdown, make and objc parsers cross all five CI platforms in #319 without a source build |
| Panes, sessions, keymaps, lifecycle, agent hooks | **write it** | perhaps 300 lines, and the only part where the requirements are actually ours |

**Do not adopt an Atom-era terminal package.** `x-terminal`,
`platformio-ide-terminal`, `termination` are all xterm.js + node-pty inside an
unmaintained wrapper — the exact shape of thing the catalog was just cleaned
of. `@lydell/node-pty`, a fork that exists to solve prebuild pain, ships **zero**
prebuilt binaries and solves nothing we have.

**Verify node-pty before committing to it**, the way the markdown parser was
verified: load it under `ELECTRON_RUN_AS_NODE` against the packaged binary and
spawn a shell. It joins the critical-natives list either way, and that list has
a way of biting during bootstrap.

**Done, and it bit as predicted.** node-pty spawns a shell under the packaged
Electron 43 binary (`EXIT=0`, correct pty geometry). Two corrections to the
table above: node-pty's 28 prebuilds are macOS and Windows only, so **Linux
builds from source** and it belongs on the critical list for that reason; and
the bite was not the list but the install — `pnpm add` puts pnpm's workspace
symlinks back over the `superstring` and `@atom/watcher` trees bootstrap
materialises, and the build then fails on an unrelated-looking nested module.
Both written down in [terminal.md](../reference/terminal.md).

**The PTY belongs in a `utilityProcess`, not the renderer.** A terminal spawns
arbitrary processes, which drives straight through the model Phase N and S
built — privileged-require restriction, FS IPC roots, the trust prompt. If the
renderer spawns shells, that model is decorative. The shape already exists
twice: the LSP host and the git workers. The renderer holds an xterm view and a
data channel; the host owns spawning, and can prompt, log or refuse.

That boundary is also the reason to build the integration rather than adopt
one: **an agent-drivable terminal is a different product from a human
terminal.** It needs a readable transcript, a permission gate on each command,
and state that survives a reload. No existing package offers that.

**Shipped: a task runner on top of it.** `.chevron/tasks.json`, run through
the pty host, gated on project trust — an agent asking to "run the tests"
becomes a named, permissioned operation rather than a shell string
([tasks.md](../reference/tasks.md)).

**Shipped: the human one.** `packages/terminal` on the pty host, gated at three
levels (validators, host protocol, and a shell running a command in the
packaged app). The agent half — transcript, per-command permission, surviving a
reload — is deliberately not in it, on the reasoning in the paragraph above.

### Where the agent client lives

As a **package** — in-process, owns its UI, activates like any other. OpenCode
does not need forking to be integrated; it needs a client.

The **boundary does not** live in a package: permission prompts, diff review
and the tool-call gate belong in core, next to the trust model. A package has
full Node access, so a security-sensitive gate implemented there is one a
package can bypass.

### First step that commits to nothing

Make the LSP host serve **project-shaped** context rather than file-shaped:
workspace symbols, references, diagnostics across the project. Humans get a
better symbols view out of it, agents get the thing they need most, and no bet
is placed on which agent wins.

**Cost:** the protocol spike is weeks; the surfaces above are quarters.
**Gate:** the smoke test drives an agent round trip end to end — propose an
edit, review it, apply it, undo it — because unit tests will not catch a broken
host (see #309, where the host looked alive and read nothing).

**Started.** `workspace/symbol` is in: `chevron.lsp.projectSymbols(query)` asks
every server running for a root and merges the answers (`src/lsp/README.md`).
Gated by a round trip through a real host process against a mock server, which
also asserts that `initialize` carries the client capability — a server that is
never asked for workspace symbols returns nothing, with no error to notice.
Next: the human surface, which needs `symbols-view` to query as you type
rather than load one list, since most servers answer an empty query with
nothing.

---

## 4. Remote editing over SSH — **dropped**

**Owner decision, 2026-09-04: not building this.** No personal use for it, and
the priority is features that get used. The costing below is kept as-is
because the question recurs, and because two of its findings outlive the
decision: the FS abstraction in the recommendation is worth doing on its own
merits, and "remote LSP only" remains the cheap answer if remote ever becomes
urgent.

### Why it is hard *here* specifically

VS Code can do this because its extension host is a **process boundary with an
API**: an extension asks for a file, and the host decides whether that means
local disk or a socket to a remote server.

Chevron is the opposite, by design and by explicit decision. Packages have
direct Node access. Phase S kept the editor at `sandbox: false` precisely so
preload can load natives. Today **40 files across the catalog require `fs`,
`fs-plus` or `fs-extra` directly**, and the hot natives — superstring,
tree-sitter, pathwatcher, nsfw, git-utils, fuzzy-native, ctags — read the local
disk themselves, below any JavaScript seam.

Two things make it less impossible than it was for Atom: the catalog is
**closed and owned** (88 packages, no community packages ever), so an
abstraction can actually be enforced; and an FS IPC layer already exists —
`src/main-process/register-fs-ipc.js`, **15 channels**, with strict roots.

### Option A — a virtual filesystem every package goes through

Introduce one FS interface, route every package and every core call through it,
and give it a remote implementation.

**Pros**
- One protocol, one place to make remote work.
- The abstraction pays off locally too: it is the same seam a sandboxed
  package host would need, and it makes FS access auditable per package.
- Incremental. Packages can be converted one at a time behind a CI check that
  bans new raw `fs` requires — the same ratchet shape that worked for TextMate.

**Cons**
- **Every native that touches disk defeats it.** superstring reads files for
  the buffer, tree-sitter parsers read grammars, pathwatcher/nsfw watch paths,
  git-utils reads `.git`, fuzzy-native crawls. Each needs a remote answer or a
  local cache, and they are the packages' hot path.
- Synchronous APIs. `fs-plus` is used synchronously in places, and a remote FS
  cannot be synchronous. Every such call site becomes async, which ripples into
  the callers' control flow.
- It is a permanent tax: every future package must obey it.

**Cost for Chevron:** 40 call sites is the visible part and the cheap part.
The natives are the real work, and the sync-to-async conversion is the risky
part — it changes code that has been working since Atom.

### Option B — a real server that mirrors the runtime

Ship a headless Chevron on the remote host. It owns the files, the natives, the
LSP host, git and search; the local app becomes a UI that talks to it.

**Pros**
- The natives problem disappears: they run next to the files, where they belong.
- Language servers and search run **remotely**, which is the actual reason
  people want this — running `rg` and `clangd` over a mounted FS is what makes
  the naive approaches unusable.
- No sync-to-async rewrite in package code: packages keep talking to a local
  disk, it just happens to be the server's.

**Cons**
- Two products. A server build, its own release channel, version negotiation
  with the client, and an upgrade story when they disagree.
- The security model doubles: Phase N/S reasoning about a trust boundary now
  has a second process on a different machine, with the FS-IPC roots argument
  to make all over again.
- Latency is now a UI problem, everywhere. Every synchronous editor assumption
  becomes a stutter.
- It is roughly the size of the entire modernization programme to date.

**Cost for Chevron:** quarters, and a permanent second thing to ship. This is
the option that needs an owner decision about what Chevron is *for*, not an
engineering estimate.

### Alternatives worth weighing first

1. **SSHFS / network mount.** Zero editor work. Editing is fine; search,
   watching and language servers are unusable over the wire. Honest answer for
   occasional remote edits, and it costs nothing to recommend today.
2. **Remote LSP only.** Run language servers on the remote host and keep files
   local via mount or sync. The LSP host already speaks a protocol over a
   process boundary — pointing it at a remote host is a much smaller change
   than a virtual FS, and it recovers the single biggest thing a mount loses.
3. **Sync-based** (mutagen/unison style): local files, background bidirectional
   sync, remote build and test. Everything local stays fast; the cost is
   conflict handling and the fact that it is not really remote editing.
4. **Don't.** Say Chevron is a local editor, and let the agent work happen
   where the files are — which is where track 3 is going anyway. An agent host
   with remote execution may serve the same need as remote editing, without
   the runtime split.

### Recommendation, if it ever returns

Do not start with either option. Do the one piece every version needs and that
pays for itself immediately: **route package file access through an
abstraction, with a CI ratchet banning new raw `fs`**. That is a genuine
improvement in auditability, it is the prerequisite for a sandboxed package
host, and it converts the remote question from "rewrite the editor" to "choose
an implementation".

If remote becomes a priority before that lands, alternative 2 (remote LSP) is
the cheapest thing that addresses the actual pain.

---

## What this document is not

It is not a plan for the agent surfaces in track 3 — diff review, task state,
permission prompts and the terminal each need their own scoping once the
protocol shape is decided. §4 is a record of a closed question, not a backlog
item. Tracks 1 and 2 are ready to start as written.
