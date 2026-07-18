# tree-sitter (Chevron fork)

Vendored from DeeDeeG/node-tree-sitter (Atom-era) with V8 API fixes for Electron 14+.

## Patches

- `src/conversions.cc` and `src/node.cc`: replace 3-arg `ArrayBuffer::New(isolate, data, len)` with V8-owned `ArrayBuffer::New(isolate, byteLength)` and read via `Data()` (not `GetBackingStore()`, which does not link under MSVC against Electron's Chromium-libc++ `node.lib`).
- Keep `vendor/superstring/text-buffer-snapshot-wrapper.h` (header stub only — do not replace with full superstring package).
