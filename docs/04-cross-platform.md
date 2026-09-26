# 04 — Cross-Platform Playbook (macOS + Windows)

## 1. Support matrix (v1 target)

| Axis | Floor | Ceiling / Notes |
|---|---|---|
| macOS | 12.x (Monterey, what AE 2024+ requires) | 15.x current; Intel + Apple Silicon (panel is arch-agnostic; helpers ship universal2) |
| Windows | Win 10 21H2 x64 | Win 11 x64; no ARM64 native helpers in v1 (panel JS runs fine under emulation) |
| After Effects | 22.0 (2022) | Current major (26.x as of 2026); support window = current + 4 majors |
| CEP runtime | CEP 11 | CEP 12 features used behind detection |
| Node (sidecar) | CEP-embedded Node (host-controlled) | See §5 — no assumption of modern Node APIs |

**Parity rule:** a feature is *done* only when it passes on both OSes in the QA matrix
(doc §7). Release notes must call out any exception; exceptions require a waiver.

## 2. Platform difference map

| Concern | macOS | Windows | OPERATOR's approach |
|---|---|---|---|
| Extension install dir (user) | `~/Library/Application Support/Adobe/CEP/extensions/` | `%APPDATA%\Adobe\CEP\extensions\` | Install scripts + ZXP; resolve via CEP's own data APIs, never hardcode |
| System-wide dir | `/Library/Application Support/Adobe/CEP/extensions/` | `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` | Used by enterprise installer only |
| `aerender` path | `/Applications/Adobe After Effects <v>/Support Files/aerender` | `C:\Program Files\Adobe\Adobe After Effects <v>\Support Files\aerender.exe` | Auto-detect all installed versions; user override in settings; verify before job submit |
| AE plug-ins dir (AEGP) | App `Plug-ins/` + `~/Library/Application Support/Adobe/Common/Plug-ins/7.0/` (shared) | App `Support Files/Plug-ins/` + `C:\Program Files\Adobe\Common\Plug-ins\7.0\` (shared) | First-run copy flow with consent; verify per AE version at runtime |
| Path semantics | POSIX, case-(in)sensitive per volume, `:` legacy | Drive letters, UNC `\\server\share`, case-insensitive, `\` and `/` mixed | See §3 rules |
| Exec spawning | `spawn` w/ .app bundles → use binary inside `*.app/Contents/MacOS` | `.exe`; PATH semantics differ | Sidecar wraps a per-OS "tool locator" with probed cache |
| Permissions | TCC prompts for Documents/Desktop/Network volumes | UAC elevation for Program Files writes | First-run "compatibility check" explains and tests both; degrade gracefully |
| Code signing | Developer ID + hardened runtime + **notarization** (notarytool) for AEGP & agents | **Authenticode** (EV cert) for AEGP & agents | §6 pipeline |
| ZXP signing | Same ZXPSignCmd + cert both OSes | Same | One cert covers both |
| Gatekeeper/SmartScreen | Quarantine on downloaded ZXP/installers | SmartScreen reputation | Publish hashes; use established installers; EV cert builds reputation fast |
| File watching | FSEvents-ish via Node watchers (Chokidar) | ReadDirectoryChangesW | Same Chokidar API, tested for both; UNC watch → poll fallback |
| Default renderer nuances | ProRes encoders available | ProRes encode arrived on Win in recent AE; ffmpeg fallback | Detect & adjust OM template availability per OS |
| Keyboard conventions | Cmd vs Ctrl, Option vs Alt | Ctrl/Alt/Win | Keymap layer translates modifiers; UI shows both |

## 3. Path handling rules (enforced by lint + review checklist)

1. **One path type at boundaries.** Internal canonical form is a normalized JS object
   `{path, rootless}`; OS strings only at the edge (Fs/CEP/ExtendScript).
2. Convert, never concatenate: use the sidecar's `pathlib` (node `path.posix` +
   `path.win32` chosen by detected host), and ExtendScript `Folder/File` on the JSX side.
3. Case-insensitive matching on relink (Windows/FAT/APFS-default), case-**sensitive**
   exact-match preferred on macOS when volume supports it; hash match is authoritative.
4. Network paths: UNC and SMB mount forms both probed; macOS `/Volumes/<share>` vs
   `smb://` URIs mapped in the relink map.
5. No string-built JSX containing paths — paths travel as JSON args (doc 02 §5).
6. Long paths (>260 chars) on Windows: use `\\?\` extended paths in sidecar fs calls.

## 4. Native & binary distribution

- **ZXP layout:** one package, per-OS payload folders:
  `ext/native/darwin-universal/`, `ext/native/win32-x64/`, plus pure-JS panel bundle.
  Installer copies per-OS helpers (AEGP `.plugin`/`.aex`, agent daemon) to the right
  locations on first run with consent; both payloads shipped so one ZXP serves both OSes.
- **ffmpeg/ffprobe:** NOT bundled in the ZXP by default (size + LGPL cleanliness).
  First-use flow: offer to download a pinned, checksum-verified **LGPL build** from our
  release mirror, or auto-detect a user-installed binary (`PATH`, common locations).
  GPL-only components never used; the features enabled depend on the build flags.
- **Node native modules (SQLite driver etc.):** prefer pure-JS (`sql.js`) to avoid
  CEP Node ABI headaches; if a native dep becomes necessary, ship prebuilds for the
  CEP Node ABI per-OS inside the native folders and gate with a pure-JS fallback.
- **AEGP/agent signing:** macOS universal2, Developer ID, hardened runtime,
  notarized staple; Windows x64 Authenticode. Unsigned dev builds only run on
  machines with debug flags — documented in doc 06.

## 5. Runtime detection & compatibility check

On first run per version the panel runs a **compatibility probe** (results stored):
CEP version · Node availability/flags · aerender versions found · ffmpeg found ·
AEGP present · plug-ins dir writability · project-dir writability · network policy.
Results drive the "Limited mode" ladder (doc 02 §7) and a copy-pasteable
diagnostics report for IT admins and support.

## 6. Signing, packaging & updates pipeline

```
build (both OS) → bundle → per-OS natives staged → ZXPSignCmd (cert + tsa)
→ notarize darwin helpers (notarytool, staple) → sign win helpers (signtool, EV)
→ GH Release artifacts (zxp + sha256) → channels: beta → stable (staged rollout %)
```

- **Certificates:** ZXP code-signing cert (self-signed for dev; production cert from a
  CA Adobe accepts — budgeted doc 05) · Apple Developer ID ($99/yr) · Windows
  EV code-signing (~$200–500/yr). Secrets in CI vault; signing on CI only.
- **Update flow:** panel checks a signed manifest (Ed25519) on our endpoint; downloads
  the new ZXP to a staging folder and guides the user through an in-app update helper
  (or hands off to the installer for locked-down enterprise setups). Never auto-execute
  downloaded binaries silently.

## 7. CI & QA matrix

**CI (GitHub Actions):** build matrix `macos-14/macos-15` × `windows-2022/windows-2025`
for TS/JS/bundle + packaging + signing dry-runs; unit tests everywhere (panel core,
path layer, parsers); JSX harness compiles and smoke-evaluates modules in a mocked
ExtendScript environment.

**AE-in-the-loop:** licensed AE installs on **self-hosted runners** (one mac, one win)
run: script smoke suite (open fixture project → run command set → assert project JSON
dump), palette index perf gates, relink fixture suite, aerender E2E job, upgrade-suite
(AE 22→current on a VM farm, monthly).

**QA matrix (per release, both OSes × AE {current, current−1, current−2}):**
install/uninstall · first-run consent flows · undo integrity after flagship batch ops ·
relink on external/UNC drives · render job submit & cancel · crash-recovery of audit
log · upgrade-in-place from previous extension version · clean-install regression.

## 8. Localization & regional

- i18next from day 1; RTL-aware components; unit tests with pseudo-loc (length +40%)
  to catch truncation; date/number formatting via `Intl` with fixed `fullDate` fallbacks.
- Fonts: UI ships with system-font stack matching AE theme per OS.
- Docs: EN at GA; JA/DE community localization fast-follow (market signal).

## 9. Known platform risk items (tracked)

| Item | Risk | Mitigation |
|---|---|---|
| CEP Node flags disabled by enterprise policy | Sidecar dead → reduced features | Pure-CEP fallbacks (File API via CSInterface) for P0 features; "Limited mode" |
| macOS notarization drift (new requirements) | Release blocked | notarytool in CI; notarize check in release checklist; buffer days before launches |
| Windows AV false-positives on agent daemon | Install friction | EV cert + submission to Defender/Microsoft allowlist program; signed from v1 |
| Apple Silicon vs Intel AE (older versions run Intel AE under Rosetta) | Path/hook quirks in AEGP | Universal2 binary; run matrix on Intel mac until support window drops it |
| UNC/OneDrive/Dropbox placeholder files | Relink & watch chaos | Placeholder-aware scans (size==0/offline attributes) with explicit user prompt |
| AE major update day-0 breakage | Emergency patch load | Quirk-table data layer; "safe mode" toggle that disables affected domains; fast-follow policy (≤1 week) |
