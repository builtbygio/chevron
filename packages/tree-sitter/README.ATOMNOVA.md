# tree-sitter (AtomNova fork)

Vendored from DeeDeeG/node-tree-sitter (Atom-era) with V8 API fixes for Electron 14+.

## Patches

- `src/conversions.cc` and `src/node.cc`: replace 3-arg `ArrayBuffer::New(isolate, data, len)` with `NewBackingStore` + `ArrayBuffer::New(isolate, store)`.
- Keep `vendor/superstring/text-buffer-snapshot-wrapper.h` (header stub only — do not replace with full superstring package).
