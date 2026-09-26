# 07 — Open Questions & Decisions Pending

Format: **question → options → recommendation → decision deadline.** Items marked
🔒 need the product owner/founder; everything else is team-decidable.

| # | Question | Options | Recommendation | Deadline |
|---|---|---|---|---|
| 1 🔒 | **Final product name** — "OPERATOR" is a codename; trademark risk in the "Operator" software name space | keep · rename (invented, ownable name) | Trademark search + shortlist of 3 before public beta; rename before beta (renaming after GA costs marketability) | Month 3 |
| 2 🔒 | **Pricing model** | (a) free core + Pro tier · (b) one-time perpetual · (c) subscription only · (d) paid only | (a): free core palette/doctor/batch (adoption), Pro = RenderOps farm, Data/Captions studio, SDK, snapshots — **$99/yr or $149 perpetual w/ 1 yr updates**; beta users grandfathered 12 mo | Month 6 (before GA pricing pages) |
| 3 🔒 | **Distribution mix** | Adobe Exchange only · direct (own site/aescripts) · both | **Both** — Exchange for CC-desktop discovery, direct for margins + faster releases (Exchange review adds lead time). Same ZXP, signed once | Month 6 |
| 4 🔒 | **AE floor version** | AE 2022 (22.x) · 2023 (23.x) · 2024+ | **22.x** — the scripting DOM delta 22→26 is small; CEP 11 floor covers it; re-evaluate at GA with real install-base telemetry (never drop below 10% of users) | GA −1 month re-check |
| 5 | **Telemetry default** | opt-in · opt-out | **Opt-in, aggregated, documented** (doc 01 principle 7); prompt once after week 1 of usage, never nag | Phase 1 exit |
| 6 | **Native AEGP companion timing** | Phase 4 (post-GA) · pull into GA | **Keep Phase 4** — installer friction + signing burden should not gate GA; polling fallback is acceptable; revisit at Phase 3 review | Month 8 |
| 7 | **ffmpeg policy** | bundle LGPL · download-on-demand · user-supplied only | **Download-on-demand (pinned + checksummed) + auto-detect user binary** — keeps ZXP lean + licensing clean; features degrade gracefully | Phase 3 start |
| 8 | **LAN farm at GA or beta-flagged** | full GA · beta flag | **Beta-flagged in Phase 3** — agents + LAN security surface need a soak period; RenderOps without agents is GA | Month 9 |
| 9 | **Lottie exporter** | build own · fork/derive maintained open exporter · integrate as dependency | **Derive from a maintained MIT exporter, upstream fixes**; do not own the whole Lottie surface in v1; feature-flag until parity suite passes | Phase 4 entry |
| 10 | **Design system** | Spectrum CSS tokens · fully custom | **Spectrum tokens + custom components** — AE-native feel, low maintenance, easy UXP UI swap later (doc 02 §9) | Week 2 |
| 11 | **GA localization set** | EN only · EN+4 · EN+7 | **EN, DE, ES, JA** (largest AE markets) at GA; FR/PT-BR/zh-Hans fast-follow via community pipeline | Month 7 |
| 12 | **License validation** | offline keys only · activation server · hybrid | **Hybrid, offline-first**: Ed25519-signed key file; optional periodic online re-validation; no feature kill-switch on connectivity | Month 8 |
| 13 | **Module marketplace payments** (third-party Ops authors) | at SDK launch · later | **Later** (post-Phase 5) — curation/review/payout operations are a company on their own; SDK can thrive on free/shared packs first | Month 12 review |
| 14 | **Community home** | Discord · forum · both | **Discord early** (feedback velocity during beta), forum later for searchable long-tail | Phase 1 exit |
| 15 🔒 | **Team & budget approval** | 4-person baseline (doc 05) · solo variant · contract-heavy hybrid | Baseline if funded; if solo: cut farm + SDK per doc 05 variant — flagship identity intact, GA slips to month ~14 | Month 0 (now) |
| 16 | **Undo/snapshot retention policy** | keep all · rotate (N days / N GB) | **Rotate: 7 days or 2 GB per project**, user-configurable; snapshots are restore points, not backups (say so in UI copy) | Phase 2 start |
| 17 | **UXP migration trigger criteria** | calendar-based · API-coverage-based | **Coverage-based**: when AE's UXP API covers ≥80% of our P0 command surface *and* CEP deprecation is announced → dual-publish; spike report due month 9 regardless | Month 9 |

## Next concrete actions (in order)

1. 🔒 Resolve #15 (team & budget) — everything downstream scales from it.
2. Kick off **Phase 0**: monorepo scaffold per doc 06, CI matrix green on both OSes.
3. Order certificates (ZXP code-signing, Apple Developer, Windows EV) — long lead times; needed by week 4.
4. Lock the name decision path (#1): trademark search this week.
5. Recruit a 30-artist private beta cohort during Phase 1 build (month 3).
