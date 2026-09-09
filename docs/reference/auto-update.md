# Auto-update

**Implementation:** `src/main-process/auto-update-manager.js`, `src/main-process/update-config.js`, `script/lib/update-config-file.js`, `script/lib/generate-update-metadata.js`, `script/electron-builder.config.js`
**Feed:** GitHub Releases of `builtbygio/chevron`, read by [electron-updater](https://www.electron.build/auto-update)

Atom updated through GitHub's Squirrel service, which no longer exists. Chevron updates through electron-updater against its own GitHub Releases: no server of ours, and the release job already puts everything there.

## What a user sees

Every four hours while `core.automaticallyUpdate` is on, and on **Help › Check for Update**, the app looks at the latest release. What happens next depends on the build:

| Build | Mode | Behaviour |
|-------|------|-----------|
| Windows (NSIS install) | `in-app` | Downloads the new installer in the background; **Restart and Install Update** (or quitting) runs it silently |
| macOS, signed and notarized | `in-app` | Downloads the universal zip; Squirrel.Mac swaps the bundle on restart |
| macOS, unsigned preview | `download-page` | Squirrel.Mac refuses unsigned code, so the app offers the Releases page instead |
| Linux (deb, rpm, tar) | `download-page` | The package manager owns the install; the app offers the Releases page |
| Source checkout, specs | `unsupported` | Nothing runs |

The states (`checking`, `downloading`, `update-available`, `no-update-available`, `error`, `unsupported`) and the window messages are unchanged from Atom, so the application menu and the **about** package work as before.

Releases are currently published with `prerelease: true`. electron-updater ignores pre-releases for a stable version, so preview users who want in-app updates set **`core.allowPrereleaseUpdates`**; beta and nightly builds always see them. Turn that default around when releases stop being previews.

## How the build wires it

- **`app-update.yml`** — `package-application.js` writes it beside the app (`Contents/Resources` on macOS, `resources/` elsewhere) from the repository in `package.json`: `provider`, `owner`, `repo`, `updaterCacheDirName`, and Chevron's own `codeSigned: false`. The signing step rewrites `codeSigned: true` *before* `codesign` seals the bundle. The main process reads that one key to choose the mode; electron-updater reads the rest.
- **`latest-mac.yml`** — written by `script/mac-universal --update-metadata` from the universal zip (`generate-update-metadata.js`): version, sha512 (base64) and size per file, release date.
- **`latest.yml` and the blockmap** — written by electron-builder while it makes the NSIS installer (`script/build --create-windows-installer`, `script/electron-builder.config.js`, run with `--prepackaged` so nothing inside the app changes).
- **Release job** — attaches `*.zip`, `*.exe`, `*.blockmap` and `latest*.yml`. electron-updater finds the release through `releases.atom` (no token) and reads the yml from that tag's assets, so asset names must not contain spaces, which GitHub rewrites.

`CHEVRON_UPDATE_FEED_URL=http://host/dir/` points electron-updater at a generic server serving the same files, for testing an update end to end from a local directory.

## Signing and notarization

Every signing step reads its credentials from the environment under the names electron-builder uses, so one set of repository secrets serves both our scripts and electron-builder. Absent secrets are not an error: each step logs that it skipped, and the unsigned preview builds exactly as before.

| Secret | Used by | Role |
|--------|---------|------|
| `MAC_CSC_LINK` → `CSC_LINK` | `code-sign-on-mac.js` | Developer ID Application certificate: a `.p12` as base64 (or a path) |
| `MAC_CSC_KEY_PASSWORD` → `CSC_KEY_PASSWORD` | | Its password |
| `CSC_NAME` (optional) | | Identity to sign with; otherwise the Developer ID Application identity in the certificate |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | `notarize-on-mac.js` | notarytool credentials (an App Store Connect API key via `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` also works) |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | `code-sign-on-windows.js`, electron-builder | Code-signing certificate for `chevron.exe`, its DLLs, and the installer |
| `WIN_PUBLISHER_NAME` (optional) | electron-builder | Subject name the updater verifies the downloaded installer against |

macOS signs with hardened runtime and `resources/mac/entitlements.plist` (JIT, unsigned executable memory, no library validation: what Electron and its native modules need), imports the certificate into a throwaway keychain, and deletes the keychain afterwards. The universal bundle is signed once, after the merge (`mac-universal --code-sign`), then notarized and stapled. Windows signs every `.exe` and `.dll` in the app with `@electron/windows-sign`, and electron-builder signs the installer.

## Testing an update

1. Build twice with different versions (`ATOM_RELEASE_VERSION=1.4.1 ./script/build …`), producing the newer installer/zip and its `latest*.yml`.
2. Serve the newer artifacts from a directory over HTTP.
3. Run the older build with `CHEVRON_UPDATE_FEED_URL` pointing at it and choose **Check for Update**.

On macOS this needs both builds signed by the same identity; Squirrel.Mac checks that the update's signer matches the running app's.
