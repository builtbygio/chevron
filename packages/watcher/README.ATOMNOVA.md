# @atom/watcher (AtomNova fork)

Vendored from `@atom/watcher@1.3.5` with V8 API fixes for Electron 14+.

## Patch

`src/nan/functional_callback.cpp`: replace `ArrayBuffer::GetContents` / 3-arg `ArrayBuffer::New` with `GetBackingStore` / size-based `New` + memcpy.
