# 02 — Architecture

## 1. System overview

```
┌────────────────────────────────  Adobe After Effects (macOS / Windows)  ───────────────────────────────┐
│                                                                                                        │
│  ┌─────────────────────────── CEP 12 Panel (CEF/Chromium) ──────────────────────────┐                  │
│  │  UI Shell (React 18 + TS + Spectrum CSS)                                          │                  │
│  │   ├─ Operator Bar (command palette)   ├─ Module docking/inbox    ├─ i18n (RTL)   │                  │
│  │   ├─ Virtualized data grids           ├─ Toasts/progress         ├─ Theme (AE)  │                  │
│  │  └─ Panels: Asset Doctor · Layers · Text · Easing · Data · Render · Ops Library  │                  │
│  │                                                                                   │                  │
│  │  Command Core (registry · fuzzy search · keymap · macro engine · audit log)       │                  │
│  │        │                                                                          │                  │
│  │  HOST ADAPTER (interface)  ◄── CEPHostAdapter today · UXPHostAdapter later       │                  │
│  │        │  CSInterface.evalScript()   ▲ progress/result events                     │                  │
│  └────────┼───────────────────────────────┬─────────────────────────────────────────┘                  │
│           ▼                               ▼                                                              │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────────────────┐     │
│  │ ExtendScript (JSX)       │   │ Node sidecar (CEP Node)  │   │ Native AEGP companion (Phase 4)  │     │
│  │ task-runner modules      │   │ fs · spawn · ffmpeg      │   │ C++ · event hooks · push events    │     │
│  │ undo-grouped, chunked   │   │ aerender jobs · ws/http   │   │ project-changed / RQ status        │     │
│  │ ES3-transpiled from TS  │   │ local store (SQLite)     │   │ universal2 + x64, signed           │     │
│  └────────────▲────────────┘   └─────────────▲────────────┘   └───────────────▲───────────────────┘     │
│               │                              │                                  │                       │
│               ▼                              ▼                                  │                       │
│        After Effects DOM (app.project)   OS: files, processes, LAN agents ──────┘                       │
│                                         (aerender / ffmpeg / farm agents over WebSocket)                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        External integrations (opt-in): Discord/Slack render webhooks · Google Sheets watch · TD tools ──┘
```

Four cooperating layers, one ZXP package. The **Host Adapter** is the strategic seam:
UI and command logic never touch `CSInterface` directly, so a future UXP host
(doc 02 §9) is a new adapter, not a rewrite.

## 2. Layer responsibilities

### 2.1 Panel UI (CEF)
- **Stack:** React 18 + TypeScript (strict), Vite, Zustand (state), TanStack Virtual
  (10k-row layer tables), Radix/Spectrum-CSS widgets themed to AE dark, i18next,
  Fuse.js-style fuzzy ranking (custom scorer for AE object names), Monaco-based code
  editor (console/expression workbench).
- **Why CEF-safe:** no native npm modules in the panel bundle; everything is
  browser-JS. CEP's Chromium is not the latest, so the build targets ES2020 + broad
  browserslist, with polyfills chosen against CEP 11/12 runtime reality.
- **Panels are views of the command core**, never owners of logic. Every action =
  a registered command with: id, title, scope predicate, params schema, undo policy,
  audit metadata.

### 2.2 Command Core (the "super operative" heart)
- **Command Registry** — typed commands with JSON-schema params; powers palette,
  keymap, macros, console, SDK. ~350+ commands at full scope (doc 03).
- **Operator Bar (palette)** — fuzzy search over commands + live project index
  (comps, layers, footage, effects, markers, expressions); context-aware ordering;
  accepts params inline (`rename: shot_, pad:3`).
- **Macro Engine ("Workflows")** — composes commands into DAG steps
  (run, iterate-over-selection, conditionals on result, prompts). Recorded from UI
  actions; edited as visual steps or JSON; exported/importable as `.opk` packs.
- **Keymap** — panel-level shortcuts (CEP panels receive key events when focused);
  collision-aware defaults; conflicts with AE shortcuts surfaced, never stolen silently.
- **Audit log** — append-only local log: command, target counts, duration, errors,
  undo token. Powers "what did I just run" and support diagnostics.

### 2.3 ExtendScript layer (JSX modules)
- Authored in **TypeScript**, transpiled to ES3 ExtendScript (Babel preset used by the
  community CEP toolchain — see doc 06); `json2` polyfill for JSON; one `#targetengine`
  session engine for state.
- **Task protocol** (critical — evalScript is synchronous and blocks AE's UI thread):
  1. Panel dispatches `runTask {id, module, fn, args}` via adapter.
  2. JSX executes in **chunks** (N items per slice), reporting progress via
     `window.__adobe_cep__.dispatchEvent` → panel updates UI between chunks.
  3. Long tasks use `app.scheduleTask()` continuation so AE can pump events.
  4. Result: strict-schema JSON `{ok, data, errors[], undoToken}`.
  - Every mutating task wraps `app.beginUndoGroup/endUndoGroup`; snapshot manifest is
    written by the sidecar before batch ops (doc 03 §Asset Doctor).
- **Module map** (mirrors doc 03 domains): `project/`, `assets/`, `comps/`, `layers/`,
  `text/`, `keys/`, `shapes/`, `effects/`, `expressions/`, `render/`, `timeline/`,
  `snapshot/`, `util/` — each with feature gates (`has(name)` checks like
  essential properties, new property types).
- **Capabilities registry:** every gated API is probed at startup; the panel disables
  (not hides) unsupported commands with a tooltip stating the required AE version.

### 2.4 Node sidecar (CEP Node context)
- Node is enabled per CEP rules (manifest flags; see doc 06). Used for:
  - **Filesystem heavy lifting:** project index scanning, checksum (xxhash64) mapping
    for relink, snapshot storage/diff, macro/ops packs, log rotation.
  - **Process control:** `aerender` (batch/farm), `ffmpeg`/`ffprobe` (media inspect,
    GIF/WebM/H.264 exports, audio analysis for beat-sync), user's tools.
  - **Local store:** SQLite (pure-JS `sql.js` or better-sqlite3 prebuilt per-OS — see
    doc 04 §native-deps) for the project index, relink map, audit log, preset library.
  - **LAN orchestration hub:** WebSocket server broadcasting render jobs to
    OPERATOR **Agents** (small signed helper daemon, opt-in install) on studio machines;
    agents report status; dashboard aggregates. Also exposes a localhost HTTP API for
    TD tools (token-authenticated, disabled by default).
- **Isolation rule:** sidecar may read/write only (a) its own data dir, (b) the current
  project's folder, (c) paths the user explicitly picks. Enforced at command layer.

### 2.5 Native AEGP companion (Phase 4, optional but transformative)
- C++ AEGP plugin using the AE SDK: registers menu commands, and — the key win —
  **push events**: project-changed, item added/removed, render queue status changes,
  active comp/selection changes, expressed as JSON posted to the sidecar hub.
- Eliminates polling latency for the project index and enables live render dashboards.
- Separate build targets: macOS universal2 (signed + notarized), Windows x64
  (Authenticode). Ships inside the ZXP per-OS folders, copied to the user plug-ins dir
  on first run with explicit consent (admin prompts handled per-OS — doc 04).
- **Fallback:** if absent, the panel degrades to sidecar polling + change-detection
  checksums. OPERATOR is fully functional without it.

### 2.6 Module SDK (third-party "Ops")
- Signed `.opk` folders: `manifest.json` (id, version, permissions, host-range),
  `commands/*.json` (declarative UI steps) and/or `jsx/`, `js/` (programmatic),
  `presets/`, `i18n/`, `icon.svg`.
- **Permission model:** `project:read/write`, `fs:projectdir`, `fs:pick`,
  `net:none` default; every grant is user-approved at install; audit log records module
  actions. No dynamic `eval` of remote code; module code is sandboxed to the SDK API.
- Dev mode: hot-reload from a developer folder for module authors; versioned SDK with
  semver contract + compatibility matrix stored with the opk.

## 3. Data flow walkthroughs

**Example A — "Batch rename 500 layers with a pattern":**
1. Palette → `layers.renameBatch` (params: scope=selection|comp|project, pattern, regex toggle).
2. Sidecar writes snapshot manifest (project path, item list, hash) → returns `snapshotId`.
3. Adapter → JSX `Layers.renameBatch` chunked 50/slice, undo group open, progress events.
4. Panel shows live progress; Esc triggers cooperative cancel (checked between chunks).
5. Result `{renamed: 493, skipped: [{layer, reason}]}`; audit entry + toast with **Undo** action.

**Example B — "Render 18 comps overnight on 3 studio machines":**
1. RenderOps view → multi-select comps → apply Output-Module template (user-defined OM
   presets, cross-platform path variables).
2. Sidecar builds job specs, saves queue AEPs (`rqSave`), distributes via WS hub to
   agents; agents spawn `aerender -project ... -RStemplate` locally.
3. Status/events stream back (AEGP or RQ XML poll fallback) → live dashboard, ETA,
   failure triage (missing footage → deep-link to Asset Doctor relink), Discord webhook.
4. Completion: optional ffmpeg post (GIF/WebM/H.264 proxy) + delivery manifest (MD5).

**Example C — "Import SRT → styled text layers":**
1. User drops `.srt` → sidecar parses/validates (encoding-safe, offset checks).
2. Command `text.captionsFromSRT` with style template (text style presets, RTL/bidi
   flags) → JSX creates/updates text layers with markers, chunked + undo-safe.
3. Re-runs are **idempotent** (layers tagged with op metadata; update-in-place).

## 4. Data model & persistence

| Store | Tech | Contents |
|---|---|---|
| Project Index | SQLite (sidecar) | comps/layers/assets/effects snapshot, fuzzy-search cache, change counters |
| Relink Map | SQLite | filename + xxhash64 → resolved path history, cloud-prefix remaps |
| Snapshots | FS (per project dir, `.operator/`) | manifest JSON + incremental AEP copies, rotation policy |
| Ops/Macros | FS (`~/Operator/ops`) | `.opk` packs, marketplace imports, signatures |
| Settings | JSON (+ registry-safe defaults) | user prefs per host version, keymap, license state |
| Audit Log | JSONL (rotated) | every command execution |

All cross-boundary payloads use **strict JSON schemas** (shared TS types + AJV on
panel side, hand-rolled validators on JSX side — ExtendScript cannot run AJV).

## 5. Security model

- ZXP signed (SHA-256, ZXPSignCmd); self-update only over TLS with Ed25519-signed
  manifests; downgrade protection.
- All external data (CSV/JSON/SRT/opk) schema-validated before touching the project;
  path traversal guards on every relink/collect/consolid target.
- Network is opt-in: LAN hub binds localhost by default; remote agents require an
  operator-generated pairing token. No telemetry by default; opt-in, aggregated, and
  documented. Crash reports (Sentry self-host or in-house) exclude project content.
- ExtendScript bridge is command-id + JSON-args only (no string interpolation of user
  data into JSX source), eliminating the classic evalScript injection class.

## 6. Performance strategy

| Concern | Strategy |
|---|---|
| Big projects (2k+ items) | Sidecar-built index; virtualized UI; JSX chunking; never enumerate all properties unless scoped |
| evalScript latency | Batch one evalScript per operation, not per item; protocol-level batching + coalescing |
| UI thread blocking | Chunk size auto-tunes (measure slice ms, target <16ms/slice → adapt N) |
| Render jobs | All aerender/ffmpeg in sidecar processes; panel never waits synchronously |
| Palette search | Prebuilt token index + streaming scoring; 10k entities < 30ms p95 on both OSes |
| Memory | Index evicted per project switch; SQLite WAL; log rotation |

**Perf gates in CI:** synthetic 2,500-layer/1,200-item project fixture; palette p95,
batch-rename throughput, relink scan throughput must hold on the baseline hardware
matrix (doc 04) or the release blocks.

## 7. Error handling & observability

- Every command returns a typed result envelope; panel shows **actionable** errors
  ("3 layers locked — unlock?" with a one-click follow-up command).
- Errors → audit log + optional crash report; sidecar keeps a rolling diagnostic bundle
  (versions, AE build, recent ops) the user can export for support in one click.
- Degradation ladder: AEGP missing → polling; Node disabled (locked-down host) →
  reduced feature set clearly surfaced ("Limited mode: contact your IT admin");
  filesystem denied → user-pick fallback.

## 8. Compatibility & versioning strategy

- **Host support:** AE 22.0 (2022) → current (26.x). CEP runtime floor: CEP 11 (AE 2022
  ships CEP 11; 2024+ ships CEP 12) — manifest `RequiredRuntime` 11.0, graceful use of
  CEP 12 features behind detection. `Host="AEFT"` range `[22.0,99.9]`.
- **AE API drift:** capability probes at startup; per-version quirk table maintained as
  data (not code); "compat matrix" published with each release.
- **Extension semver:** breaking host behavior = major; new commands = minor; palette
  index format changes tracked with migrations.
- The panel also works across multiple installed AE versions (one install, all hosts).

## 9. UXP migration path (strategic hedge)

- As of Sept 2026, Adobe's AE developer portal centers on **panels via CEP + scripting
  via ExtendScript + native SDK**; CEP-Resources actively ships CEP 12 and a UXP
  migration guide, and UXP panels are the direction of travel across CC video apps.
- Hedge: (1) all AE DOM access behind `HostAdapter` + JSX modules; (2) UI components
  are plain React with an adapter for Adobe styling (Spectrum tokens), so a UXP UI
  toolkit swap is contained; (3) **Spike (month 9):** implement 3 commands against the
  UXP host surface when AE's UXP API reaches parity for those operations, and measure.
- Migration trigger: UXP AE API covers our P0 command surface. Then: dual-publish
  (CEP for legacy AE versions ≤ host-switchover, UXP for new), sharing the command core.
