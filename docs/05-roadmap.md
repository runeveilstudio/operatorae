# 05 — Roadmap, Team, Budget, Risks

## Phase plan (team-of-4 baseline; solo variant below)

| Phase | Duration | Exit criteria |
|---|---|---|
| **0 · Foundation** | Weeks 1–4 | Monorepo + build/sign CI (both OS), CEP panel skeleton loads in AE 22→current, Host Adapter + task protocol proven with 3 commands, compat probe, snapshot store v1 |
| **1 · MVP "The Bar"** | Weeks 5–16 (~month 4) | Operator Bar + command registry (~120 cmds), Asset Doctor v1, batch layer ops, selection helpers, hex-color, scripting console, undo/audit everywhere. **Private beta (30 artists)** |
| **2 · Craft** | Months 4–7 | Easing library, text styles, effects/preset browser, expression workbench + JS↔Legacy converter, snapshots & diff, markers/timecode, keymap, i18n framework + first languages, macro recorder v1, support-bundle tooling. **Public beta (aescripts/own site)** |
| **3 · Scale** | Months 7–10 | RenderOps (RQ templates, aerender batching, ffmpeg deliverables), LAN farm + agents, data & captions studio (CSV/JSON/Sheets, SRT/VTT, charts), proxy manager, collect/consolidate, ops-pack sharing. **GA candidate** |
| **4 · Depth** | Months 10–13 | Native AEGP companion (push events; both OS signed), beat-sync, project structure reporter, Lottie export integration, color checker hardening, render cost hints |
| **5 · Ecosystem** | Months 13–16 | Module SDK GA, docs + author kit, in-app Ops library (curated signed packs), first 3 third-party Ops, UXP host-adapter spike report → migration decision |
| **6 · Horizon (post-GA backlog)** | ongoing | Marketplace payments, LUT preview, structural merge research, AE-adjacent hosts (PPro palette reuse evaluation), AI-assist evaluation (deferred per doc 01) |

**Public GA = end of Phase 3 (month ~10).** Paid tiers activate at GA with beta
grandfathering. Exchange listing submitted during Phase 3.

## Milestones & demo beats (external-friendly)

- M1 (wk 4): "One panel, both OSes" — CI builds signed ZXP from one repo.
- M2 (month 4): "The Bar" demo video — palette, doctor, 500-layer rename with undo.
- M3 (month 7): beta launch — craft tools + snapshots.
- M4 (month 10): GA — render farm dashboard + captions/data demo on stage.

## Team plan (baseline)

| Role | Load | Notes |
|---|---|---|
| Senior TS/UI engineer | 100% | Panel + command core |
| Senior TS/Node engineer | 100% | Sidecar, farm, packaging, CI |
| AE domain expert / pipeline engineer | 100% | JSX modules, AE API quirks, SDK docs |
| Product designer (UI/UX) | 60% | Spectrum-based design system, palette UX |
| QA (contract) | 40% ramping to 100% at GA | Matrix execution, fixture farms |
| Community/support | 25% from beta | Docs, tutorials, Discord |

**Solo/small-team variant:** cut Phase 3 scope to RQ-templates + aerender batch
(no LAN agents), Phase 4 AEGP → post-GA, Phase 5 SDK → post-GA. Timeline ≈ 14–18
months to GA with 1.5–2 people; flagship identity (Bar/Doctor/Batch) survives intact.

## Budget sketch (12 months, USD)

| Item | Est. |
|---|---|
| Team (4 FTE-blend, mixed regions) | $380k–550k |
| Certificates (ZXP cert, Apple Dev, Windows EV) + infra (runners, storage, mirror) | $2k–6k |
| Tools (Sentry self-host or hosted, analytics opt-in stack, docs hosting) | $3k–10k |
| Test hardware (Intel mac, AS mac, Win box, NAS) | $4k–8k |
| Launch (site, tutorial videos, aescripts/Exchange placement effort) | $10k–20k |
| **Total** | **≈ $400k–590k** |

## Risk register

| # | Risk | P×I | Mitigation |
|---|---|---|---|
| R1 | **Adobe accelerates CEP→UXP for AE** faster than expected | Med×High | Host Adapter seam; UXP spike in month 9; maintain CEP floor for older AE; community radar (Adobe dev forums, CEP-Resources releases) |
| R2 | evalScript/UI-thread blocking regressions make big projects feel slow | Med×High | Task protocol is P0; perf gates in CI; chunk auto-tuning; no release with a red perf gate |
| R3 | AE version drift breaks commands | Med×Med | Capability probing + quirk tables + day-0 safe-mode policy (doc 04 §9) |
| R4 | Signing/notarization pipeline stalls a release | Med×Med | Signing fully automated in CI; release checklist includes re-notarize dry-run |
| R5 | ffmpeg licensing mistake (GPL contamination) | Low×High | LGPL builds only; feature-gate; legal review before GA; user-supplied binary supported |
| R6 | Support burden scales with command count (~350) | High×Med | Actionable error envelopes; diagnostics bundle; docs for every command auto-generated from registry; audit log triage |
| R7 | Marketplace clones / incumbents bundle up | High×Low | Differentiation = unified operative UX + SDK + farm; ship velocity; community Ops flywheel |
| R8 | Security incident via module SDK | Low×High | Permission model, signed packs, no remote eval, audits, coordinated disclosure policy |
| R9 | Scope creep ("vast range" pulls everything forward) | High×Med | This document *is* the scope contract; P0/P1 only pre-GA; anti-features list honored |
| R10 | Solo-bus-factor / AE expert availability | Med×Med | Quirk knowledge written into repo data tables + docs from day 1 (not tribal) |

## Competitive landscape (differentiation)

| Competitor class | Examples | Our angle |
|---|---|---|
| One-trick keyframe/easing tools | Flow, Ease & Wizz, Motion Tools Pro | Included inside one registry; consistent UX; batch-aware |
| Project hygiene scripts | pt_ scripts, compData, Rift-class | Asset Doctor + undo/snapshot safety net + cross-project search |
| Render tools | RenderGarden-class aerender farms | LAN agents integrated in-UI, no separate license friction; post-render pipelines |
| Caption/data tools | Various caption & CSV scripts | Idempotent re-sync + templated styling + Sheets watch |
| Panels from studios | internal tools | SDK so studios *extend* instead of reinvent |

Launch plan: beta via aescripts + own site + Discord; tutorial series per flagship
("The Bar", "Doctor your project", "Farm night renders"); Exchange listing at GA;
pricing decision in doc 07 (recommendation: free core + Pro tier).
