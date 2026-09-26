# 01 — Vision & Goals

## Vision statement

After Effects users lose hours to repetitive surgery: renaming, relinking, re-rendering,
copy-pasting settings, hand-building captions and charts, babysitting the render queue.
Tools that fix this exist as a dozen disconnected scripts and $30–150 one-trick plugins.

**OPERATOR** is the single "super operative" living inside AE: one panel that can *find,
fix, batch, automate, and render* anything in a project — driven by a command palette,
recordable macros, and an SDK, with identical behavior on macOS and Windows.

> The rule: **every feature is a command; every command is batchable, undo-safe,
> scriptable, and cross-platform by default.**

## Personas

| Persona | Profile | Primary needs |
|---|---|---|
| **Freelancer Fiona** | 1–3 person studio, 15–40 projects/yr | Relink missing media fast, presets, quick captions, GIF/WebM/MP4 presets, don't break undo |
| **Studio artist Sam** | Motion designer in a 10–50 seat studio | Batch layer ops, easing presets, template comps, project hygiene, shared preset library |
| **Pipeline TD Tara** | Builds studio tooling, scripts daily | Scripting console, expression workbench, headless `aerender` orchestration, WebSocket/HTTP API, module SDK |
| **Agency lead Alex** | Approves + delivers many variants | Data-driven variants (CSV→comp), render farm batching, snapshots/diffing before risky ops, delivery presets |

## Product pillars

1. **Operate everything from one bar.** A Raycast/Alfred-grade command palette inside AE:
   search & run any action, jump to any comp/layer/asset/effect, fuzzy, keyboard-first.
2. **Batch is the default.** Nothing operates on one item when it could operate on the
   selection, the comp, or the whole project. All batch ops wrapped in undo groups with
   preview ("dry-run") mode.
3. **Never destroy.** Every risky operation is preceded by an automatic snapshot
   (project state manifest) and wrapped in `app.beginUndoGroup()`. Dry-run + diff preview.
4. **Automate without code.** Workflow Macros record and compose commands into shareable
   "Ops" (JSON pipelines). TDs get a real console and SDK when code is wanted.
5. **Identical on macOS & Windows.** One codebase, one ZXP, feature-parity SLA, no
   platform-specific UX paths.

## The Operative Principles (engineering commandments)

1. **Everything is a command** — every UI action registers in the command registry and is
   callable from the palette, console, macros, and SDK. No orphan buttons.
2. **Undo-safe & snapshot-safe** — undo groups + pre-op snapshot manifest always.
3. **Never block the AE UI thread** — ExtendScript work is chunked with a progress
   protocol; heavy lifting goes to the Node sidecar.
4. **Feature-detect, never version-assume** — gate on capability checks, not `app.version` guesses.
5. **Deterministic serialization** — one JSON bridge (polyfilled in ExtendScript),
   strict schemas validated on both ends.
6. **Cross-platform parity is a release blocker** — a feature ships on both OSes or doesn't ship.
7. **Local-first & privacy-safe** — project content never leaves the machine unless the
   user invokes a feature that explicitly needs it (opt-in telemetry only).
8. **Observe yourself** — an operation audit log (what ran, on what, how long, errors).

## Goals (12 months)

- G1: Ship stable MVP (Phase 1) covering palette, project/layer/text tooling — **by month 4**.
- G2: Cover all 13 AE domains (doc 03) at P0/P1 level — **by month 10**.
- G3: RenderOps batch + LAN orchestration GA — **by month 8**.
- G4: Module SDK + first 3 third-party Ops — **by month 12**.
- G5: ≥ 95% feature parity verified by automated per-OS test suite each release.
- G6: Establish UXP-port readiness (adapter layer proven by a spike) — **by month 9**.

## Non-goals (explicitly out of scope v1)

- ❌ Building a DCC/NLE/compositor — OPERATOR drives AE, it doesn't replace it.
- ❌ GPU-accelerated effects (native effect plugin) — not a PF/effect plugin project (v1).
- ❌ Cloud rendering service — LAN/local orchestration only; no hosted render SaaS.
- ❌ Project syncing/merge-conflict resolution à la full Git for AEP binary internals —
  snapshots + text-diff only (structural merge is a research item, not v1).
- ❌ Full DCC interop bridges (Maya/Blender/C4D live links) — file-based exchange only.
- ❌ AI generation features — out of v1 scope (fast-moving legal/reputational surface);
  revisit post-GA (noted as a Phase 6 candidate).

## Success metrics

| Metric | Target @ 6 months post-GA |
|---|---|
| Install → first palette command ("activation") | ≥ 60% within first session |
| Weekly active panels / monthly active panels | ≥ 0.45 |
| Commands run per active user per day | ≥ 15 |
| Undo-after-batch rate (destructive regret signal) | < 2% |
| Crash-free sessions | ≥ 99.5% |
| Support tickets per 100 installs | < 3 |
| App Store / Exchange rating | ≥ 4.5★ |
| macOS ↔ Windows usage split mirrors AE user base | within ±10% relative |

## Assumptions & constraints

- Adobe continues CEP support through at least 2027 (CEP-Resources active in 2026 with
  CEP 12 + UXP migration guide published). ExtendScript remains AE's scripting engine.
- After Effects is a licensed product; our automated CI needs self-hosted runners with
  licensed AE installs (no headless AE in the cloud).
- Legal: ZXP code-signing certificate required for distribution (Adobe Exchange or
  direct); Apple Developer ID + notarization for macOS helpers; ffmpeg must be an
  LGPL-configured build (or user-supplied binary) to keep distribution clean.
- The panel must tolerate AE major-version updates with ≤ 1 week triage (API drift is
  historically low; the scripting DOM is stable).

## Working name

**OPERATOR** (working title; final name TBD in doc 07). Product language: "Ops" are
shareable operations, the "Operator Bar" is the palette, "Asset Doctor" audits projects.
