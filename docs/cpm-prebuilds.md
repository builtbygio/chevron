# cpm prebuilds (Phase 3)

Prefer downloading platform binaries for native packages before compiling with `@electron/rebuild`.

## Install / rebuild order

1. **Already present** `.node` under the package tree  
2. **`chevron.prebuilds` URL** template(s) in the package’s `package.json`  
3. **`prebuild-install`** when the package declares `binary` / `prebuild-install` / `prebuilds/`  
4. **Source rebuild** via `@electron/rebuild`  

Force source compile:

```bash
cpm rebuild --force-source
# or
cpm rebuild my-native-pkg --force-source
```

## Package author: `chevron.prebuilds`

```json
{
  "name": "my-native-pkg",
  "version": "1.0.0",
  "chevron": {
    "prebuilds": "https://github.com/org/my-native-pkg/releases/download/v{version}/{name}-{platform}-{arch}-electron{electron}.node"
  }
}
```

Supported tokens: `{name}` `{version}` `{platform}` `{arch}` `{electron}` `{abi}`.

- Single **`.node`** file → written to `build/Release/`.  
- **`.tar.gz`** → extracted into the package root (layout should place `.node` under `build/Release/` or similar).

## Package author: standard prebuild-install

If your package already uses [prebuild](https://github.com/prebuild/prebuild) / prebuildify and publishes GitHub Release assets that `prebuild-install` understands, cpm will invoke it with:

```text
--runtime electron --target <product electronVersion>
```

## Example GitHub Actions workflow

See [`.github/workflows/cpm-prebuild-example.yml`](../.github/workflows/cpm-prebuild-example.yml) for a template that builds `.node` artifacts for Electron on a matrix of OS/arch and uploads them as release assets.

## Notes

- Installs still use **`--ignore-scripts`** by default; prebuilds are applied by **cpm**, not by untrusted install scripts.  
- Headers URL remains `https://electronjs.org/headers` (or product config) for source rebuilds.  
- Prefer prebuilds for cold-start UX; keep source rebuild so packages remain hackable.
