# OPERATOR — Mission Control for After Effects

> **Codename:** OPERATOR · **Kind:** Adobe After Effects extension (panel + automation engine)
> **Platforms:** macOS & Windows · **Host range:** After Effects 2022 (22.x) → 2026+ (current)
> **Status:** 🟡 Planning — docs 01–07 below are the approved planning baseline.

**OPERATOR** is a "super operative" — one deep, keyboard-first, batch-everything
extension that covers the vast range of After Effects: project & asset surgery,
layer/text/animation tooling, data-driven graphics, captions, presets, expressions,
render-queue automation and farm orchestration, project snapshots, and a module SDK
for third-party "Ops" — all in a single dockable panel with a command palette at its core.

## Documentation index

| # | Document | Contents |
|---|----------|----------|
| 1 | [01 — Vision & Goals](docs/01-vision-and-goals.md) | Vision, personas, pillars, operative principles, success metrics, non-goals |
| 2 | [02 — Architecture](docs/02-architecture.md) | System design, tech stack, bridge/adapter layer, task protocol, module SDK, security, performance, UXP path |
| 3 | [03 — Feature Matrix](docs/03-feature-matrix.md) | Vast-domain feature coverage, priorities, phase mapping, flagship capabilities |
| 4 | [04 — Cross-Platform Playbook](docs/04-cross-platform.md) | macOS/Windows parity rules, paths, signing/notarization, packaging, CI matrix, QA |
| 5 | [05 — Roadmap & Risks](docs/05-roadmap.md) | Phases 0–6, milestones, team plan, budget, risk register, competition, launch plan |
| 6 | [06 — Repo & Dev Workflow](docs/06-repo-and-dev-workflow.md) | Monorepo layout, toolchain, dev loop, release checklist |
| 7 | [07 — Open Questions](docs/07-open-questions.md) | Decisions pending: pricing, AE floor version, distribution, telemetry defaults |

## The plan in 60 seconds

- **Platform choice:** CEP 12 panel (CEF/Chromium) + **ExtendScript** engine for AE automation + **Node sidecar** for fs/ffmpeg/aerender + optional **native AEGP** companion (Phase 4). CEP is confirmed active in 2026 (CEP-Resources ships CEP 12 + a UXP migration guide); UXP panels are not yet AE's primary extensibility path, so CEP gives the "vast range" coverage today. A **Host Adapter abstraction** keeps a future UXP port cheap.
- **Single ZXP** ships both platforms; native bits are per-OS folders inside the package, or downloaded on first run. Signed ZXP (ZXPSignCmd) + notarized/signed helpers.
- **Flagship UX:** an AE-native **Command Palette** ("Operator Bar") where every feature, layer, comp, effect, asset, and macro is one fuzzy-search away — plus **Workflow Macros** (multi-step ops), **Asset Doctor** (project audit & relink), **RenderOps** (queue templates, aerender batching, LAN farm), and a **Module SDK**.
- **Team & time:** 4 people (~2 eng, 1 AE-domain expert/pipeline, 1 design+QA shared) → MVP in ~3–4 months, full vision in ~12–14 months. Solo-dev variant included in doc 05.
