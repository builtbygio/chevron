# @atom/watcher (Chevron fork)

Vendored from `@atom/watcher@1.3.5` with V8 API fixes for Electron 14+ and MSVC builds.

## Patches

1. `src/nan/functional_callback.cpp`: replace `ArrayBuffer::GetContents` / 3-arg `ArrayBuffer::New` with `ArrayBuffer::Data()` / size-based `New` + memcpy. Prefer `Data()` over `GetBackingStore()` so Windows MSVC can link against Electron's Chromium-libc++ `node.lib`.
2. `src/helper/windows/helper.h`: declare the two-arg `windows_error_result` before the one-arg wrapper (MSVC C2672), and call `FormatMessageA` so UNICODE builds compile.
