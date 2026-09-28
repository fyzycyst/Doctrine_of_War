# Releasing Doctrine of War

Agents never create, see or store signing credentials. Everything below is done by the
project lead. With **no** signing environment variables, `npm run build:mac` still builds
the unsigned local DMGs (`electron-builder.cjs` logs `macOS build mode: unsigned`).

| Variable | What it is | Used for |
| --- | --- | --- |
| `CSC_NAME` | `Your Name (TEAMID)`: the certificate name **without** the `Developer ID Application:` prefix (cert in your login keychain) | signing |
| `CSC_LINK` + `CSC_KEY_PASSWORD` | alternative to `CSC_NAME`: path (or base64) of an exported `.p12`, and its password | signing (CI) |
| `APPLE_API_KEY` | **path** to the `AuthKey_XXXXXXXXXX.p8` file | notarization |
| `APPLE_API_KEY_ID` | the key's ID (10 characters) | notarization |
| `APPLE_API_ISSUER` | the Issuer ID (a UUID) | notarization |

Build modes: no cert → **unsigned**; cert only → **signed** (hardened runtime, `build/entitlements.mac.plist`
with `allow-jit` only); cert + all three `APPLE_API_*` → **notarized**. A partial `APPLE_API_*` set, or
`APPLE_API_*` without a cert, fails the build; so does a cert that cannot be found (`forceCodeSigning`).

## 1. Developer ID Application certificate (once)

Needs a paid Apple Developer Program membership; only the **Account Holder** can create this type.

1. Xcode → Settings → Accounts → select your team → **Manage Certificates…** → **+** →
   **Developer ID Application**. (Or: developer.apple.com → Certificates → **+** →
   Developer ID Application, with a CSR from Keychain Access → Certificate Assistant.)
2. Check it: `security find-identity -v -p codesigning` lists
   `"Developer ID Application: Your Name (TEAMID)"`.
3. For CI only: Keychain Access → My Certificates → right-click the certificate →
   **Export…** → `.p12` with a strong password. Keep the file outside the repo.

## 2. App Store Connect API key (once)

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** →
   **Team Keys** → **+**. Name it `notarize-doctrine-of-war`, access **Developer**.
2. **Download** the `.p8` (possible only once) to e.g. `~/.private_keys/AuthKey_XXXXXXXXXX.p8`,
   then `chmod 600` it. Note the **Key ID** and the **Issuer ID** shown above the list.

## 3. Local signed + notarized build

```sh
export CSC_NAME="Your Name (TEAMID)"
export APPLE_API_KEY="$HOME/.private_keys/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
npm ci
npm run build:mac        # logs "macOS build mode: notarized"; notarization takes a few minutes
```

Outputs: `release/Doctrine of War-<version>-arm64.dmg` (Apple silicon), `release/Doctrine of War-<version>.dmg` (Intel).

## 4. Verify

```sh
app="release/mac-arm64/Doctrine of War.app"
codesign --verify --deep --strict --verbose=2 "$app"
spctl -a -vv -t exec "$app"     # expect: accepted, source=Notarized Developer ID
xcrun stapler validate "$app"   # expect: The validate action worked!
```

Final check on a clean Mac (or another user account): download the DMG from the release,
open it, drag the app to Applications, launch. There must be no Gatekeeper warning.

## 5. Web build on Vercel

1. vercel.com → **Add New… → Project** → import `fyzycyst/Doctrine_of_War`.
2. Framework preset: **Other**. Leave the build settings empty: `vercel.json` sets
   `npm ci`, `npm run build` and the output folder `dist`. (The CC0 KayKit figures are lab-only and
   never part of a build; `npm run fetch:cc0` is only for the dev Look Lab.)
3. Deploy. Check that the tutorial plays, and check the headers:
   `curl -sI https://<project>.vercel.app | grep -iE "content-security|x-content-type|referrer|permissions"`.

`vercel.json` sends the production CSP as an HTTP header (a test keeps it equal to the
build's `<meta>` CSP), plus `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options` and COOP. Only Vite's hashed `/assets/*` files are cached immutably.

## 6. Enable the GitHub release workflow

The workflow is drafted at `docs/release/github-release.yml.draft` and is **not active**.

1. Add repository secrets (Settings → Secrets and variables → Actions → **New repository secret**):
   - `MAC_CERT_P12_BASE64`: `base64 -i DeveloperID.p12 | pbcopy`
   - `MAC_CERT_PASSWORD`
   - `APPLE_API_KEY_P8_BASE64`: `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy`
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER`
2. Approve the CI change, then:
   `mkdir -p .github/workflows && git mv docs/release/github-release.yml.draft .github/workflows/release.yml`
   and commit.
3. Release: bump `version` in `package.json`, commit, `git tag v0.1.0 && git push origin v0.1.0`.
   The workflow tests, builds, notarizes, verifies with `spctl`/`stapler`, and creates a
   **draft** GitHub release with both DMGs. Review it, then publish it.

## Icon

`build/icon.icns` is a placeholder made from the favicon sigil. To replace it, edit
`build/icon.svg` (1024×1024, 824px tile) and run `scripts/make-icon.sh`.
