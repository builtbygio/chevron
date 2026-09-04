# Config precedence

Where a setting's value comes from, and which source wins when several have an
opinion. This is the contract `script/ci/config-precedence.test.js` enforces as
a matrix; if the two disagree, the test is right and this document is stale.

Background: [next-tracks-plan.md](../process/next-tracks-plan.md), track 2.

---

## Sources

| Source | Lives in | Applies to |
|--------|----------|-----------|
| **default** | the schema, `src/config-schema.js` | everything |
| **user** | `~/.chevron/config.json` | everything |
| **root** | `<project root>/.chevron/config.json` | files under that root |

A **scoped** setting is one written under a language selector — `".source.js"`
— rather than at the top level. Both user and root config can carry them.

Multi-root has always worked; per-root *config* is what track 2 adds. Before
it, `Config` held a single `projectFile` and one bag of `projectSettings`, so
a window with three roots could apply the settings of at most one.

---

## Order

Highest first. The first source with a value wins; nothing is merged across
sources except plain objects against their schema default.

| # | Source | Scoped? | Example key |
|---|--------|---------|-------------|
| 1 | root config for the file's root | yes | `".source.js": { "editor": { "tabLength": 2 } }` |
| 2 | root config for the file's root | no | `"editor": { "tabLength": 2 }` |
| 3 | user config | yes | `".source.js": { "editor": { "tabLength": 4 } }` |
| 4 | user config | no | `"editor": { "tabLength": 4 }` |
| 5 | schema default | — | `editor.tabLength` |

**The source outranks the specificity.** A plain setting in a root's config
beats a language-scoped setting in the user's config. That is deliberate, and
it is the one rule people find surprising, so it is worth the sentence: a
setting in a repository's config was written by someone who knew which
repository they were in. A language preference in user config is a default
someone set once. When the two disagree about a file in that repository, the
repository wins.

This matches VS Code, where folder settings — language-specific or not —
outrank user settings.

### What a file outside every root gets

Sources 3, 4 and 5 only. There is no root, so there is no root config, and no
error either: opening a loose file is normal.

### What happens with nested roots

The **longest matching root path** wins, and only that one applies. Roots do
not stack: a file under `/a/b` with roots `/a` and `/a/b` reads `/a/b`'s
config and ignores `/a`'s. Merging the two would make the effective value
depend on the order roots were added, which is exactly the kind of thing that
produces a bug report nobody can reproduce.

---

## Where a value came from

Every resolved value can name its source, because the question "why is my tab
length 2 here and 4 there" has to be answerable without reading four files.

```js
chevron.config.get('editor.tabLength', { root, scope });
chevron.config.getSourceOf('editor.tabLength', { root, scope });
// => { source: 'root', path: '/repo/.chevron/config.json', scoped: true }
```

`source` is one of `root`, `user` or `default`.

---

## Keeping open editors right

Root config changes when the project's roots change, or when someone edits a
`.chevron/config.json` and the project reloads it. Open editors have to follow.

`onDidChange('editor.tabLength', { scope })` cannot carry that: it reports the
value resolved *without* a root, and that value does not move when a root's
config does. So `Config` emits its own event:

```js
chevron.config.onDidChangeRootSettings(() => { /* re-resolve */ });
```

`TextEditorRegistry` listens to it and re-resolves each maintained editor
against its own path, applying only the settings that actually moved.

The same reasoning bans a shortcut in the other direction. When a *user*
setting changes, the event's `newValue` is the root-less value, and applying it
to every editor sharing the scope would hand a root's editor the user's number.
Each editor is resolved again against its own root instead.

---

## When a root's config is read

- when the window opens, and whenever the project's roots change
- when the file changes on disk, including a save from inside Chevron

The second one has no watcher of its own: every project root is already
watched recursively, so this is a filter on `did-change-files` events that
arrive anyway, debounced because one save arrives as several events.

A root that leaves the project takes its settings with it, in the same pass.

**A file that will not parse keeps the last good settings.** Someone editing
their config has it in a broken state for as long as they are typing, and
snapping every editor to the user defaults halfway through would be worse than
waiting. A warning names the file, once per distinct error rather than once per
save. Nothing is written back: it is a file people commit, and the editor does
not edit it silently.

---

## What this does not change

- **Writing.** `config.set` still writes to user config unless given an
  explicit `source`. Nothing writes to a root's config file on the user's
  behalf: it is a file people commit, and the editor does not edit it silently.
- **Scoped resolution within a source.** Selector specificity still decides
  between `".source.js"` and `".source.js.jsx"` inside one config file;
  `scoped-property-store` handles that and is unchanged.
- **`core.fsIpcStrict` and other main-process settings.** They are read
  without a root and resolve at 3–5.
