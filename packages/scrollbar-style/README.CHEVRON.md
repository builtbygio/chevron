# scrollbar-style (Chevron)

**Required exports:** `getPreferredScrollbarStyle`,
`onDidChangePreferredScrollbarStyle`, `observePreferredScrollbarStyle`.

Chevron: `src/workspace-element.js` observes `'legacy'` vs `'overlay'`.

N-API addon `build/Release/scrollbar-style-observer-native.node`.
Keep the export names; do not wrap in a default object.
