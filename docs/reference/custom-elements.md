# Custom elements under contextIsolation

**Polyfill:** `@webcomponents/custom-elements`, loaded from `static/index.js`
**Code:** `src/*-element.js`, `src/create-custom-element.js`

## Why a polyfill at all

The app boots in the preload world (`static/preload.js`), because
contextIsolation leaves the page world without Node. Blink exposes
`CustomElementRegistry` only on the main world, so in the world the app
actually runs in:

```js
window.customElements === null   // measured in static/index.js, before the polyfill
```

Every `window.customElements.define()` in `src/` therefore goes through the
polyfill. It is not an optimisation or a legacy leftover: without it the app
does not boot.

## Why this polyfill

`document-register-element` held the role until 2026-09-07. It registers
elements, but its lifecycle is not the platform's:

| | document-register-element | @webcomponents/custom-elements |
|---|---|---|
| `connectedCallback` on insert | asynchronous, on a timer captured at load | synchronous |
| parser-created nodes (`innerHTML`) | upgraded, constructor **not** run | upgraded, constructor run |

Both differences leaked into the app and the suite:

- The spec runner mocks `setTimeout`, and `advanceClock` cannot drive a timer
  captured before the spy, so `connectedCallback` had not run for any core
  element by the time a spec asserted. Specs were testing half-built elements.
  This is what #374 worked around, element by element, by moving setup into
  `initialize()`.
- Elements reached `connectedCallback` without their constructor having run, so
  `text-editor-element.js` grew `ensureInitialized()` — everything the
  constructor sets up, reachable from whichever callback runs first.

`@webcomponents/custom-elements` patches `appendChild`, `insertBefore` and the
`innerHTML` setter and runs the reactions inline, which is what a native
implementation does.

## What this does not change

The defensive patterns stay. `ensureInitialized()` and the "reachable from
`initialize()`" rule are cheap, and an element that does not depend on callback
ordering is easier to reason about either way;
`script/ci/custom-element-upgrade.test.js` still enforces it.

`src/create-custom-element.js` also stays: it constructs via
`new ElementClass()` rather than `document.createElement`, which is correct
regardless of the polyfill.

## Measured effect

Spec failures before and after the swap, same build:

| spec | before | after |
|---|---|---|
| `text-editor-element` | 29 | 3 |
| `workspace-element` | 12 | 0 |
| `styles-element` | 5 | 0 |
| `pane-container-element` | 2 | 0 |
| `pane-element` | did not report | 0 |
