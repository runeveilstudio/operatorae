# 06 — Repo & Dev Workflow

## 1. Monorepo layout

```
operator/
├── apps/
│   ├── panel/                    # CEP panel (React UI + command core)
│   │   ├── src/
│   │   │   ├── shell/            # window chrome, docking, toasts, theme, i18n bootstrap
│   │   │   ├── palette/          # Operator Bar (fuzzy index, params, keymap)
│   │   │   ├── views/            # Asset Doctor, Layers, Text, Easing, Data, RenderOps…
│   │   │   └── main.tsx
│   │   └── CSXS/manifest.xml     # AEFT host range [22.0,99.9], CEP 11 floor
│   ├── jsx/                      # ExtendScript runtime (TS → ES3)
│   │   └── src/modules/{project,assets,comps,layers,text,keys,shapes,effects,
│   │                    expressions,render,timeline,snapshot,util}/
│   ├── sidecar/                  # Node context: fs, sqlite, spawn, ws hub, http api
│   └── agent/                    # LAN render agent (signed daemon, Phase 3)
├── packages/
│   ├── host-adapter/             # HostAdapter interface + CEPHostAdapter (UXP later)
│   ├── command-core/             # registry, schemas, macro engine, audit types
│   ├── protocol/                 # task protocol, result envelopes, event names
│   ├── pathkit/                  # cross-OS path rules (doc 04 §3) + relink matching
│   ├── parsers/                  # SRT/VTT/CSV/JSON/opk (shared panel+sidecar)
│   ├── ui-kit/                   # Spectrum-based design system tokens/components
│   └── i18n/                     # locales, pseudo-loc test fixture
├── native/
│   ├── aegp/                     # C++ AEGP companion (Phase 4; CMake, universal2 + x64)
│   └── scripts/                  # signing helpers (notarytool, signtool, ZXPSignCmd)
├── tools/
│   ├── build/                    # bolt-style packaging (zxp), dev install scripts
│   ├── fixtures/                 # synthetic AE projects (2.5k layers), relink sets
│   └── schema/                   # JSON schemas shared by AJV + JSX validators
├── docs/                         # these planning docs + ADRs
├── .github/workflows/            # ci.yml (build matrix), release.yml (sign/publish)
└── package.json / pnpm-workspace.yaml / turbo.json
```

**Rule:** every AE-DOM touch lives in `apps/jsx` behind `packages/host-adapter`;
everything else is host-agnostic and unit-testable without AE.

## 2. Toolchain

| Concern | Choice | Notes |
|---|---|---|
| Package/monorepo | pnpm workspaces + Turborepo | Deterministic, fast CI caching |
| Language | TypeScript strict everywhere (incl. JSX modules) | Two-pass compile: `tsc` → ES2020 → Babel preset for ExtendScript ES3 |
| Panel bundler | Vite (CEF-safe targets/browserslist) | Community CEP toolchain pattern (bolt-cep-class); we adapt, not adopt blindly |
| State/UI | React 18 + Zustand + TanStack Virtual + Radix/Spectrum CSS | No native npm deps in the panel bundle (doc 02 §2.1) |
| Quality | ESLint + Prettier + custom path-rules lint (doc 04 §3) | CI blocks on violations |
| Tests | Vitest (core/protocol/pathkit/parsers) · mocked-ExtendScript harness for JSX modules · Playwright smoke for panel UI | AE-in-the-loop on self-hosted runners (doc 04 §7) |
| Schemas | JSON Schema in `tools/schema` → TS types via codegen; hand-rolled mirror validators for JSX | Single source of truth, no drift |
| i18n | i18next + pseudo-loc CI check | Locale PRs without code review |

## 3. Dev loop (both OSes, minutes to first run)

```bash
git clone … && pnpm i
pnpm dev            # builds panel+jsx in watch mode into dist/
pnpm dev:install    # symlinks dist → CEP extensions dir (per-OS path resolved)
pnpm dev:flags      # enables PlayerDebugMode for the CEP major you target
pnpm dev:fixtures   # installs synthetic test projects for manual QA
```

- **Debugging:** the `.debug` file exposes a remote-debug port (per-OS port ranges);
  attach Chromium/Edge devtools to the panel for full inspector workflow.
- **Hot reload:** panel HMR via Vite; JSX modules reload by re-`evalScript` on save
  (session engine reset per run); sidecar restarts on change with state re-hydration.
- **Dev flags:** `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` (macOS) /
  registry `PlayerDebugMode` (Windows) — automated by `dev:flags`, per CEP 11/12.
- **Synthetic AE env:** `pnpm test:jsx` runs modules against the mock AE DOM so most
  logic is testable without launching AE at all; the real runners add the truth layer.

## 4. Branching, releases, versions

- Trunk-based: short-lived feature branches, squash merges, PRs require green CI on
  **both** OS matrices + one AE smoke (current major).
- Extension semver per doc 02 §8; `CHANGELOG.md` generated from conventional commits.
- Channels: `beta` → `stable` with staged rollout percentages; tags drive release.yml.
- ADRs: decisions recorded in `docs/adr/NNN-*.md` (small, immutable, linked from code).

## 5. Release checklist (condensed)

1. Version bump + quirk-table (`packages/host-adapter/data/quirks.json`) refreshed.
2. CI: all tests, perf gates, `build:zxp` on both OS runners, schema snapshot diff.
3. Sign: ZXP (ZXPSignCmd) · notarize+staple darwin helpers · sign win helpers (EV).
4. Staging channel soak ≥ 48h with crash telemetry triage; crash-free ≥ 99.5% gate.
5. QA matrix execution (doc 04 §7) incl. upgrade-in-place from previous stable.
6. Publish: GitHub Release (zxp + sha256) → in-app update manifest (Ed25519) →
   Exchange submission → changelog post → support bundle recipe updated.
7. Post: 72h watch of crash/audit aggregates; rollback plan = re-point manifest.

## 6. Definition of Done (per feature)

- Command registered with schema + audit metadata + docs stub auto-generated.
- Dry-run preview implemented for any mutating batch op.
- Undo verified on fixture project; snapshot written before mutation.
- Both OSes green on matrix; capability gating present; strings in i18n keys.
- Perf budget respected (palette p95 < 30ms; chunked task < 16ms/slice).
- One recorded demo clip per feature (feeds tutorial library).
