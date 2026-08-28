# cpm — explained simply

**Audience:** anyone who wants the package-manager plan without reading the full design  
**Companion:** the technical version is in [`docs/reference/cpm-design.md`](../reference/cpm-design.md)

Imagine Chevron is a **workshop**.  
The editor is the **workbench** where you actually build things.  
**cpm** is the **tool shop next door** that fetches new tools (packages), puts them on the shelf, and sometimes **rebuilds** a tool so it fits *this* workshop’s machines.

cpm is **not** a new workbench. Packages still run inside Chevron the Atom way (`global.atom`, etc.). cpm is about **installing and fixing** packages, not rewriting how they load.

---

## Why care? (the short pain story)

The shop **used to** have a very old helper called **apm** (Atom Package Manager) — a **12-year-old apprentice** that:

- Spoke only an **old dialect** (Node 12 + npm 6)  
- Needed special patches on Apple Silicon  
- Often **could not rebuild** modern native tools against Electron 43  

| Toolkit | Who uses it | Status |
|---------|-------------|--------|
| **Modern tools** | Building Chevron itself | Host npm + modern rebuild |
| **cpm** | Installing community packages | **Ships now** (Electron-as-Node) |
| **`apm` name** | Old scripts / muscle memory | **Shim that calls cpm** |

**cpm’s job (done):** fire the old apprentice for day-to-day installs, and use the **same machine the editor already runs on**.

---

## The biggest decision (locked)

**cpm does not run on “whatever Node is on your PATH.”**  
It runs as:

```text
“Pretend Chevron.exe / Chevron.app is Node”
+ run the cpm program
+ pass install/rebuild arguments
```

That trick is called **`ELECTRON_RUN_AS_NODE=1`**.

**Why that matters (ELI5):**  
Native packages are like **keys cut for one lock**.  
If you cut the key on a different machine (host Node 24) than the one that will use it (Electron inside Chevron), the key **won’t turn**.  
By always cutting keys on the **same machine as the editor**, the ABI matches.

Typing `apm …` can still work: **`apm` becomes a nickname that calls `cpm`**.

---

## Two completely different jobs (don’t mix them up)

People say “install packages” for two different things:

### Job A — Building Chevron from source (bootstrap)

When **developers** build the app:

- Install the app’s own libraries (`node_modules`)  
- Compile helpers that ship **inside** the app  

**Plan:** use normal **host npm** + a modern Electron rebuild tool.  
That is **not** “cpm for everything.” Bootstrap stays boring and host-side.

### Job B — User / community packages (what settings “Install” does)

When **you** install something into `~/.atom/packages` or `~/.chevron/packages`:

- Download a package  
- Install its dependencies  
- Rebuild natives if needed  
- Show success/failure in the app  

**Plan:** that is **cpm**, under Electron-as-Node.

| Job | Who | Tool (target) |
|-----|-----|----------------|
| Build the app | Developers / CI | host npm + rebuild |
| Install editor extensions | Users + Settings UI | **cpm** |

If someone says “bootstrap prefers cpm,” that is the **wrong** reading of the design.

---

## Where packages live (dual home)

Chevron still respects Atom users. Package home roughly means:

1. `CHEVRON_HOME` if you set it  
2. else `ATOM_HOME` if you set it  
3. else portable folder next to the app  
4. else `~/.chevron` if it exists  
5. else **`~/.atom`** (default — don’t break existing people)

Under that home:

```text
packages/     ← the installed community packages (the shelf)
.cpm/         ← cpm’s notes (cache, logs, lock metadata)
```

**Dual-support forever** also means: keep understanding `engines.atom`, `atom://`, `global.atom`, and the name **`apm` as a shim**.

---

## What cpm actually does (commands, human version)

| You type / UI does | What happens in plain words |
|--------------------|-----------------------------|
| `cpm install foo` | Find foo → download → put on the shelf → rebuild if needed |
| `cpm uninstall foo` | Take foo off the shelf |
| `cpm list` | Look at the shelf |
| `cpm rebuild` | Re-cut native keys for **this** Electron |
| `cpm doctor` | Check paths, Electron-as-Node, headers, policy |
| `cpm search` | Ask the package catalog (Pulsar API by default) |

The Settings UI and “incompatible packages” rebuild button still call “the apm path” — that path **points at cpm**.

---

## The rebuild handshake (why the app cares so much)

Inside the editor there is a fixed ritual:

1. Spawn: `«package-manager» rebuild --no-color`  
2. Run it **inside that package’s folder**  
3. Read **exit code**, **stdout**, and **stderr**  
4. If it failed, show the **stderr** text to the user  

That is **not** only a Settings JSON API.  
It is core code (`Package.runRebuildProcess`) plus the **incompatible-packages** UI.

**cpm must honor that ritual.** Fancy new flags are fine *in addition*, but the simple `rebuild --no-color` path is sacred.

---

## How install works under the hood (without npm drama)

**Preferred path (the real plan):**

1. **pacote** — fetch tarballs / git sources  
2. **arborist** — resolve and install the dependency tree **inside cpm’s process**  
3. **@electron/rebuild** — rebuild natives for product Electron  

All of that runs under **Electron-as-Node**.

**Not the plan by default:** shell out to full `npm install --prefix …` on the Electron binary.  
Modern npm sometimes looks at “who am I?” (`process.execPath`, `process.release`) and spawns children. Under Electron-as-Node that is **under-tested**.  

So the design says: **prove it in a day-one experiment, or delete that idea.** Don’t keep a soft “or npm” escape hatch nobody has validated.

---

## Security: what cpm can and cannot do

**Honest line:**  
cpm can make **installing** safer.  
cpm does **not** sandbox a package once you turn it on.

| Stage | Everyday risk | What cpm v1 can do |
|-------|---------------|--------------------|
| Before install | Fake names, sketchy sources | Prefer pins, allowlists, SHAs for git |
| At install | Malicious `postinstall` scripts | **Scripts off by default** (big win) |
| After install | Bad package steals tokens when activated | Needs a **future** runtime sandbox (not cpm alone) |

**Simple analogy:**  
cpm is a careful **shipping dock** (check the box, don’t run mystery setup scripts).  
Once the tool is on your workbench and you plug it in, it still has the full power of the workshop until a later project builds a safety cage.

---

## Windows and “apm still works”

On Windows especially, packages and PATH installers care about small launcher files:

- `cpm.cmd` / `cpm` — the real tool  
- `apm.cmd` / `apm` — nicknames that call cpm  
- Installer / Squirrel / “install shell commands” must put those on PATH  
- Packaging scripts must **copy** the right files into the app bundle  

This is **shipping work in Phase 1**, not “we’ll notice it in CI someday.”

---

## Roadmap in plain English

| Phase | What you get |
|-------|----------------|
| **0** | Building Chevron no longer depends on apm for app libraries (host npm) |
| **1** | **cpm** installs user packages; `apm` nickname works; rebuild UI works; Windows shims real |
| **2** | Search / install-by-name via a registry or static index |
| **3** | Prefer ready-made native binaries (prebuilds) when available |
| **4** | Remove the old apm tree from the product after a transition |

Rough product framing: **0.4.x** starts Phase 0+1; **0.5.x** adds registry; bootstrap stays host npm unless the design reopens that choice.

---

## Open questions (still to decide later)

You don’t need to solve these to understand the plan:

- Prefer writing new installs under `~/.chevron` or keep `~/.atom` forever as default?  
- How to install **bundled** `packageDependencies` at build time once apm is gone?  
- Does install-time need the app’s **compile-cache**, or is runtime enough?  
- Keep any `npm --prefix` fallback after the spike, or delete it?

The full table lives in the design doc §13.

---

## One-sentence summary

**cpm is Chevron’s modern package shop:** same Electron engine as the editor, safer installs, `apm` as a friendly alias, rebuilds that the in-app UI already expects — and it does **not** claim to make every community package harmless once activated.

---

## Where to go next

| Want… | Read… |
|-------|--------|
| Full decisions, contracts, threat model | [`docs/reference/cpm-design.md`](../reference/cpm-design.md) |
| How the editor itself is structured | [`docs/orientation/atom-architecture-eli5.md`](./atom-architecture-eli5.md) |
| Technical editor map | [`docs/reference/atom-architecture.md`](../reference/atom-architecture.md) |
