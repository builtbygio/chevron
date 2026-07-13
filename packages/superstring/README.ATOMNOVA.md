# superstring (AtomNova fork)

Vendored from `superstring@2.4.4` with a minimal V8 API patch for Electron 14+.

## Patch

`ArrayBuffer::GetContents()` was removed in modern V8 (Electron 14+).
Replaced with `GetBackingStore()->Data()` in `src/bindings/text-buffer-wrapper.cc`.

## Version

Keep **`version` exactly `2.4.4`** (not a prerelease suffix).  
`text-buffer` depends on `superstring@^2.4.4`; a tag like `2.4.4-atomnova.1` does **not** satisfy that range, so npm nests an unpatched copy under `text-buffer/node_modules/superstring` and the build fails again.

Root `package.json` and `package-lock.json` must resolve superstring to `file:packages/superstring`.
