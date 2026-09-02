# Theme variables as CSS custom properties

Package stylesheets read `var(--name)` instead of `@name`, so each compiles
once instead of once per UI x syntax theme pair, and a theme switch is a
stylesheet swap rather than a recompile.

Scripts: `script/lib/generate-theme-custom-properties.js` (publishes each
theme's overrides on `:root`), `script/lib/less-to-custom-properties.js`
(rewrites references), `script/lib/compile-package-styles.js` (compiles once).

## What converts

Only the ~85 variables a theme actually overrides. The rest of
`static/variables` — the 242 octicon codes, the mixins — are constants and stay
LESS variables. Package-local variables (`about`'s `@atom-green`) are left
alone.

| LESS | CSS |
|---|---|
| `@text-color` | `var(--text-color)` |
| `darken(@c, 10%)` | `hsl(from var(--c) h s calc(l - 10))` |
| `lighten(@c, 10%)` | `hsl(from var(--c) h s calc(l + 10))` |
| `fade(@c, 50%)` | `rgb(from var(--c) r g b / 50%)` |
| `fadeout(@c, 20%)` | `rgb(from var(--c) r g b / calc(alpha - 0.2))` |
| `fadein(@c, 20%)` | `rgb(from var(--c) r g b / calc(alpha + 0.2))` |

## What does not, and why

**Arithmetic** (`@font-size + 1`) is reported, never converted. LESS infers the
unit from the left operand, so `12px + 1` is `13px`; `calc(var(--font-size) +
1)` is invalid CSS because the unit must be written out. Guessing it would
silently drop the declaration.

## Gotchas found the hard way

* `l` in relative colour syntax resolves to a **number**, not a percentage:
  `calc(l - 10)` parses, `calc(l - 10%)` does not (Electron 43 / Chrome 150).
* CSS does **not** clamp intermediate lightness where LESS does. One Light's
  `lighten(…, 8%)` reaching 102 stays 102, which made disabled and hover states
  invisible. Hence `clamp(0, …, 100)`.
* Themes are identified by the `theme` field in `package.json`, never by name —
  `lsp-ui` ends in `-ui` and is an ordinary package.
* Themes compile only `index.less`; partials depend on earlier imports.
* Compile-then-write: deleting as you go breaks relative imports.
* `glob` returns forward slashes and `path.join` backslashes, so path
  comparisons need normalising or a theme's `index.less` gets unlinked twice on
  Windows.

## The overlay contrast band

`autocomplete-plus`'s old `hsvvalue()` guard needed the syntax theme and the UI
theme in scope together, which is what forced the 16x per-theme-pair compile. A
legibility band derived from the UI theme alone needs nothing from the syntax
theme, so the consumer compiles once. `--contrast-shift-sign` expresses at
runtime the branch LESS's `contrast(bg, a, b)` picked at build time; syntax
themes publish their own sign so a mixed pair (dark UI, light syntax) picks the
right ink.
