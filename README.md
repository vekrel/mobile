<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/brand/logo-horizontal-on-dark.png">
  <img src=".github/brand/logo-horizontal-on-light.png" alt="Vekrel" width="360">
</picture>

# Vekrel-Mobile

The iOS and Android app for Vekrel. Highly inspired by T3 Code (MIT, see NOTICE).

`packages/` is a git subtree of Vekrel-Shared's `packages/` (split with `git subtree split --prefix=packages`; see Vekrel-Engine's README for the pull commands).

## Deviations from upstream T3 Code 8d3b061

- Root package name is `@vekrel/mobile-root`; app package is `@vekrel/mobile`. The npm scope, env prefix and product name are replaced by `@vekrel/`, `VEKREL_` and `Vekrel` (app name, About/Settings strings, permission strings, widget and notification titles).
- App identity (`apps/mobile/app.config.ts`): names `Vekrel Dev`/`Vekrel Preview`/`Vekrel`; schemes `vekrel-dev`/`vekrel-preview`/`vekrel`; iOS bundle id and Android package `dev.vekrel.mobile` with `.dev`/`.preview` suffixes (also in `scripts/mobile-showcase.ts` and `measure-renders.mts`). Deep-link, storage-key and tracing-service strings that began `t3code` now begin `vekrel`.
- Kept on purpose: `ThreadFeed.tsx` compares `attribution === "t3code"`, a value defined by `packages/client-runtime` (Vekrel-Shared). The Apple team pin, the Expo `updates.url`/project id, native module directory and class names (`t3-*`, `T3*`), `oxlint-plugin-t3code` and test fixtures naming the upstream GitHub repo are unchanged. They need Vekrel-owned accounts or a wider rename.
- Icons are generated, not exported with `scripts/export-android-icons.ts` / `export-brand-icons.ts` (those need macOS Icon Composer `.icon` sources under `assets/`, which are not copied). `sharp` renders the Vekrel brand `org-avatar.svg` and `mark.svg` geometry: iOS 1024 icons (`assets/{dev,nightly,prod}/*-ios-1024.png`, full-bleed on `#FF6A2B`), a minimal Icon Composer project `assets/*/app-icon.icon` (mark layer on `#FF6A2B`), Android adaptive foreground (transparent), backgrounds (`#FF6A2B`), monochrome mark, notification icon, splash images, and `apps/mobile/assets/widget/T3Mark.svg` (template-tinted mark). All three variants share one icon. `androidAdaptiveBackgroundColor` is `#FF6A2B` for all variants.
- `pnpm-lock.yaml` is upstream's with the scope renamed, then reconciled by `pnpm install` (a fresh resolve was not tried; Vekrel-Web found it drifts).
- `scripts` and `infra/*` are not workspace members (scripts' typecheck references apps/server and `.github`); `scripts/` kept on disk. `pnpm typecheck` passes for the remaining 26 projects.
- `pnpm lint:mobile` (root script, `scripts/mobile-native-static-check.ts`) needs `brew bundle install --file apps/mobile/Brewfile` (swiftlint, ktlint, detekt).
- Files copied only so tests and the Metro licenses plugin find inputs: `apps/server/src/device/deviceToolVersions.json`, `native/libghostty-vt/{LICENSE,VERSION}`, `third-party-licenses.config.json`.
- Tests: `pnpm --filter @vekrel/mobile test` passes 2163/2163. `checkout-new-task-branch.test.ts` runs `git commit` in temp repos and needs `GUARD_ALLOW_PROTECTED=1` on this machine's global hooks.
- Removed `patchedDependencies` entries (and patch files) for packages not installed here (server/desktop only):
  - alchemy@2.0.0-beta.80
  - "@ff-labs/fff-node@0.11.0"
  - dbus-next@0.10.2
  - node-pty@1.2.0-beta.15
  - app-builder-lib@26.16.1
    Every other entry is kept, including all Expo and React Native patches. The unreferenced upstream files `patches/expo-modules-core@57.0.14.patch` and `patches/expo-notifications@57.0.15.patch` are copied as-is.
- Native builds (`expo prebuild`, Xcode, Gradle) were not run.
- Accounts: upstream's hosted auth SDK is replaced by Vekrel account sign-in at the relay (`@vekrel/client-runtime/account-auth`, `apps/mobile/src/features/cloud/accountSession.ts`). Settings > Account shows a "Continue in browser" page that opens the relay's sign-in in the system browser auth session (`expo-web-browser`), returns on `<scheme>://auth/callback`, and keeps the refresh token in SecureStore. The signed-in page lists the email, Sign out and the registered servers, in the layout of the old custom profile page; the SDK's native sign-in and profile screens, its passkey associated domains and the Sign in with Apple entitlement its config plugin added are gone (Apple sign-in waits for the relay's Apple provider). Mobile has no Web Locks: refreshes are serialised in the one session. Deviation: Sign out unregisters the device (which also drops its Live Activities on the relay) with a still-valid token before revoking; upstream unregistered after sign-out without a token, so the request was skipped and a signed-out phone kept receiving the old account's pushes. A failed unregister still signs out. The account pages' palette variables are now `--color-account-*` (same values); the SDK theme JSON is no longer generated.

## Needs Vekrel-owned accounts

Still upstream values; replace before a real build or release:

- Expo `updates.url` and EAS project id (`u.expo.dev/d763fcb8-...`)
- Apple development team pin in `app.config.ts`
- `VEKREL_RELAY_URL` EAS environment value
