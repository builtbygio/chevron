# How Chevron works — explained simply

**Audience:** anyone who wants the big picture without programming jargon  
**Companion:** the technical current-state sketch is in `docs/reference/atom-architecture.md`. The architecture **target** is `docs/reference/chevron-architecture-modernization.md`.

Imagine Chevron is not one machine, but a **small building with rooms**, and each room has different keys and permissions. That is basically how the app is built.

---

## What is Chevron?

Chevron is a **desktop text editor** (like a super-powered notepad for code and writing).

Under the hood it is built with **Electron** — a toolkit that lets people make desktop apps using the same ideas as web browsers (a window that can show a page) **plus** the power to talk to your computer (open files, run tools, etc.).

Think of Electron as:

- **The browser part** → draws what you see  
- **The computer part** → can touch disks, windows, menus, and system dialogs  

Chevron (and Atom before it) is a big collection of features stacked on top of that.

---

## The most important idea

**Not every part of the app is allowed to do everything.**

Some parts are like the **front desk** (they can open doors, talk to the street, handle money).  
Other parts are like **customers in the lobby** (they can walk around and use services, but they can’t open the vault).

That separation is for **safety** and **stability**: if a buggy or hostile web page tried to run inside the app, it should not get full power over your computer.

---

## The building has three main kinds of rooms

### 1. The front desk (main process)

This is the **boss room**. It starts when you open Chevron.

It is in charge of:

- Creating the app windows  
- The top menu (File, Edit, …)  
- System dialogs (“Open folder…”, “Save as…”)  
- Opening links in your real browser  
- Listening for special requests from the editor windows  

If something is **sensitive** (touching the OS in a big way), it should go through the front desk.

**Simple analogy:** the front desk has the master keys.

---

### 2. The editor window (what you mostly look at)

Each Chevron window is like a **private office** where you edit files.

But that office is actually **two rooms sharing one door**:

#### Room A — the “workroom” (preload / isolated world)

- This is where **the real editor brain** lives.  
- Packages (tree view, git colors, GitHub, welcome screen, …) run here.  
- This room **is allowed** to use powerful computer features (read files, talk to tools, etc.), because the editor needs them.  
- The famous object called **`atom`** lives **here** (not in the empty lobby).

#### Room B — the “glass lobby” (page world)

- This is a thin shell: almost empty.  
- It is **not** allowed to use Node (the powerful computer toolkit).  
- It exists mainly because Electron windows are built like web pages.

**Simple analogy:**

- Room A = kitchen staff (can use knives and the stove)  
- Room B = dining room for guests (they only get a plate and a chair)

When people debug the app and say “I can’t see `atom`,” they are usually standing in the dining room looking for the kitchen.

---

### 3. Special side rooms

#### Guest webviews (strangers’ content)

Sometimes the app shows **web content** that should not be trusted as much as the editor itself.

Those guests get **no master keys** and stricter locks (security work called Phase N / guest lockdown).

#### GitHub helper workers (hidden rooms)

The GitHub features sometimes use **hidden helper windows** that still have more power than guests.  
That is a **legacy** setup — useful today, but the long-term plan is to reduce that privilege over time.

---

## What happens when you open the app? (startup story)

Read this like a morning routine:

1. **Front desk opens** (main process starts).  
2. Front desk **builds a window** (your editor frame).  
3. The window’s **workroom** starts first (preload).  
4. The workroom builds the **Atom environment** — the big “control panel” for the whole editor.  
5. **Packages wake up** (themes, tree view, tabs, git tools, welcome screen, …).  
6. You see the **workspace**: center area for files, side docks for project tree / git, bottom areas for search, etc.  
7. Optional extras: open a project folder from the command line, show Welcome Guide, restore last session.

Sometimes a “snapshot” is used at startup — like reheating leftovers instead of cooking from scratch — so the app opens faster. If that snapshot fails, the app still opens; it just takes longer.

---

## What you see on screen (workspace)

Think of the main window as a **desk with zones**:

```text
┌──────────┬────────────────────────┬──────────┐
│  Left    │       Center           │  Right   │
│  dock    │   (files / tabs)       │  dock    │
│  e.g.    │                        │  e.g.    │
│  project │                        │  git     │
│  tree    │                        │  github  │
├──────────┴────────────────────────┴──────────┤
│  Bottom dock (search results, etc.)          │
└──────────────────────────────────────────────┘
```

- **Center** = where you read and type  
- **Docks** = side tools that can show/hide  
- **Tabs** = open files and special pages (Welcome, Settings, …)

Each open thing is an **item** (a file editor, Welcome Guide, Settings page).  
The app keeps a **model** (the idea of “this is README.md”) and a **view** (what is drawn on screen).

---

## How typing and editing work (very simple)

When you open a file:

1. The app loads the file’s text into a **buffer** (memory copy of the text).  
2. An **editor** is the “document + cursor + selections” experience around that buffer.  
3. The **screen component** draws the text, line numbers, colors, and decorations.  
4. **Language tools** color the code (old-style grammars or modern tree-sitter parsers).  
5. **Native helpers** (compiled add-ons) make big-file text operations fast.

Decorations (like green/red git markers in the gutter) are little sticky notes attached to lines.  
If the file is closed while something is still trying to stick a note on it, you get bugs — that’s why lifecycle care matters.

---

## Packages = LEGO blocks

Almost every feature is a **package**:

| Package idea | What it feels like |
|--------------|--------------------|
| tree-view | The folder list on the side |
| tabs | The file tabs on top |
| git-diff | Colored marks for changed lines |
| github | Git / GitHub panels |
| welcome | Welcome + “Get to know Atom” guide |
| language-\* / themes | Syntax colors and UI look |

Packages can:

- **Activate** when the app starts (or when needed)  
- Register **commands** (things keyboards and menus can trigger)  
- Add buttons, panels, and tree items  
- Talk to each other through Atom’s APIs  

**Bundled packages** ship with Chevron.  
**Community packages** can be installed later (the long-term rule is: they should use the public Atom APIs, not raw computer power).

---

## How parts talk to each other (IPC)

Rooms cannot safely share every secret. They send **messages**.

```text
Workroom (editor)  ──request──►  Front desk (main)
Workroom (editor)  ◄──answer──  Front desk (main)
```

Old Atom used a shortcut called **`electron.remote`** (“pretend the front desk is right here”).  
That was convenient but risky. Chevron is moving away from it.

Today:

- Preferred path: Chevron APIs (`require('chevron')`) → application delegate → main process handlers  
- Temporary bridge: `remote-compat` for leftover package code  
- Main process only accepts **allowed** requests (not “anything goes”)

**Simple analogy:** instead of letting every employee open the vault, they fill out a form and the front desk does it.

---

## Two different “computers” people mix up

When developers say “Node version,” they often mean different things:

| Name | What it is | Why you care |
|------|------------|--------------|
| **Host Node** | The Node on your machine used to *build* the app | Bootstrap, CI, compile scripts |
| **cpm (Electron as Node)** | The package installer, running *as* the app’s Electron | Installing packages; no bundled Node 12 |
| **Electron’s Node** | The Node *inside* the running app | What the editor actually runs with |

**You do not need all of that to use Chevron.**  
You only need it if you are **building** Chevron from source.

---

## Building the app vs using the app

### Using

Double-click (or `open out/Chevron.app`) and edit files. Done.

### Building (developers)

1. Install the right host tools (modern Node + Python for compiling helpers)  
2. Run bootstrap (download dependencies, patch old tools, rebuild natives)  
3. Run build (assemble the `.app` / package)  
4. Open the result in `out/`

Natives (`.node` files) are little compiled plugins. They must match the Electron version, or the app breaks in mysterious ways.

---

## Security story in one paragraph

The editor needs power. The internet content it might show should not get that power.  
So: **front desk is powerful**, **workroom is powerful but controlled**, **lobby is weak**, **guests are locked down**.  
Over time, Chevron wants packages to ask the front desk for sensitive jobs instead of holding master keys themselves.

---

## If something feels broken, where it probably is

| What you notice | Likely “room” |
|-----------------|---------------|
| Window won’t open at all | Front desk / main process |
| Window opens but is blank | Workroom boot, themes, snapshot |
| Folder tree wrong / crash opening project | tree-view package or file natives |
| Git colors crash | git-diff + decorations lifecycle |
| Can’t find `atom` in a debugger | Wrong room (lobby vs workroom) |
| Menu / Open dialog / external links | Front desk IPC |

---

## Design goals (where this is heading)

1. Stay **hackable** (packages can still extend the editor)  
2. Stay on **Electron** (desktop app platform)  
3. Move dangerous powers **up to the front desk**  
4. Give packages **less raw computer access** over time  
5. Never give **guests** the keys  

---

## Mini map of the real project (for later)

You do not need this to understand the story, but it helps if you start reading code:

| Friendly name | Folder-ish place |
|---------------|------------------|
| Front desk | `src/main-process/` |
| Window boot | `static/preload.js`, `static/index.js` |
| Editor brain | `src/atom-environment.js`, `src/workspace.js` |
| File editor | `src/text-editor.js` |
| Packages | `packages/`, plus many in `node_modules/` |
| Security notes | `docs/process/security-phase-n.md` |
| Technical architecture | `docs/reference/atom-architecture.md` |

---

## One last picture

```text
You click “Open File”
        │
        ▼
  Workroom (editor) asks nicely
        │
        ▼
  Front desk shows the real OS dialog
        │
        ▼
  Workroom loads the file into a buffer
        │
        ▼
  Screen draws the text
        │
        ▼
  Packages add extras (tabs, git marks, tree, …)
```

That is the whole architecture in spirit: **rooms with different permissions**, **messages between rooms**, and **LEGO packages** that decorate the desk.

---

*Written for study and editing. Keep it simple; improve it as you learn.*
