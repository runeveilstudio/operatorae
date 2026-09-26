# 03 — Feature Matrix — "vast range" coverage

Priorities: **P0** = MVP-blocking · **P1** = GA core value · **P2** = GA differentiators ·
**P3** = post-GA / Pro horizon. Phases reference doc 05. "Cmd" counts are command-registry
entries (palette-searchable, macro-composable, SDK-callable — doc 02 §2.2).

## Flagship capabilities (the "super operative" identity)

1. **Operator Bar** — command palette searching commands *and* live project entities
   (comps, layers, assets, effects, markers, expressions) with inline params and repeat
   affordances. (P0, Phase 1)
2. **Workflow Macros & Ops packs** — record multi-step actions; iterate over selection;
   conditional steps; export/import `.opk`; shareable across the team. (P1, Phase 2)
3. **Asset Doctor** — one-click project audit: missing footage, duplicates, unused
   items, embedded vs linked, expression errors, color-space mismatches, oversized
   assets; each finding links to a fix command. (P0, Phase 1)
4. **Batch Layer Surgery** — rename/find-replace/tag/sort/retime en masse with dry-run
   preview and undo. (P0, Phase 1)
5. **RenderOps** — RQ templates, multi-comp batch submit, `aerender` CLI batching,
   LAN farm dashboard with agents, post-render ffmpeg deliverables, webhooks. (P1, Phase 3)
6. **Data & Captions Studio** — CSV/JSON/Sheets → comp variants & charts;
   SRT/VTT → styled text layers (idempotent re-sync); burn-in or editable workflows. (P1, Phase 3)
7. **Expression Workbench** — Monaco editor, snippet library, linter, docs lookup,
   JS ↔ Legacy expression engine conversion. (P1, Phase 2)
8. **Preset/Effects Library** — FFX + effect-chain presets, tags, search, apply-to-many,
   template comps, MOGRT-friendly authoring helpers. (P1, Phase 2)
9. **Project Snapshots & Diff** — pre-op auto-snapshots, named restore points,
   structural text-diff between snapshots ("what changed" report). (P1, Phase 2)
10. **Module SDK & Ops Marketplace (in-app library, signed packs)** — third-party
    modules under the permission model. (P2, Phase 5)

## Domain coverage

### 1. Project & Asset Management — `project/` `assets/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Project audit ("Asset Doctor"): missing media, unused, duplicates, broken expressions, color-space & bit-depth mismatches | P0 | 1 | Findings feed fix-commands |
| Smart relink: filename + fuzzy + xxhash64 checksum matching across folders/drives; cloud-prefix remap (Dropbox/Drive/UNC/NAS) | P0 | 1 | Windows UNC + macOS SMB tested |
| Collect & consolidate ("Project Manager+" with rules, dry-run report) | P1 | 2 | Copy vs reference modes |
| Proxy manager: create/attach/toggle proxies, ffmpeg-generated, per-selection | P2 | 3 | Sidecar-generated media |
| Media inspector (ffprobe): codecs, fps, color, audio channels, duration; flag vs comp settings | P1 | 2 | |
| Footage usage map: where is this asset used; replace footage across project | P0 | 1 | |
| Template project browser: user-defined starter projects with variable swap (name, resolution, colors) | P2 | 2 | |
| Multi-project: batch open/render/index sessions; project switcher in palette | P2 | 3 | One AE instance context |

### 2. Comps — `comps/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Comp creation wizard from presets (social sizes, delivery specs, fps, color mgmt) | P0 | 1 | Ships with spec presets pack |
| Comp settings batch edit (resolution, fps, duration, bg) across selection | P0 | 1 | |
| Precompose manager: mass precompose w/ naming rules, transfer effects trim, un-precompose (single-level) | P1 | 2 | |
| Comp-from-template with variable swap (title, colors, logo, length; Essential Properties aware) | P1 | 2 | MOGRT-authoring friendly |
| Comp search/replace across comps: expressions, fonts, colors, footage, effect params | P1 | 2 | Scoped regex |
| Comp duplication matrix (variants × data rows → comps) | P2 | 3 | Pairs with Data Studio |

### 3. Layers — `layers/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Batch rename: patterns, numbering, regex, prefixes/suffixes, parent-aware | P0 | 1 | Dry-run table |
| Find & replace across layer names, labels, source text | P0 | 1 | |
| Sort by name/index/time; distribute/stagger/sequence (Rift-class helpers) | P0 | 1 | |
| Label/color rules engine (by type, name pattern, tag) | P1 | 2 | |
| Layer tags (metadata notes) → palette-searchable filter buckets | P1 | 2 | Tags stored in comment/opacity-marker trickery, documented |
| Bulk toggles: shy, solo, motion-blur, 3D, adjustment, lock, guide, collapse transforms | P0 | 1 | |
| Matte & blend-mode batch set; guide-layer helper | P1 | 2 | |
| Layer notes/reporter: export comp structure to CSV/JSON/Markdown | P1 | 2 | For handoffs & PMs |
| Time ops: trim to comp, slide/ripple, freeze-frame assists | P1 | 2 | |

### 4. Keyframes & Animation — `keys/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Easing library (Flow-class): curve presets applied to selection; editable visual library | P0 | 2 | Core differentiator UX |
| Springs & overshoot generator (physics-parameterized keyframes, deterministic) | P1 | 2 | Bounce/anticipation presets |
| Keyframe tools: nudge, scale blocks, stagger, copy/paste velocity, select by type | P1 | 2 | |
| Keyframe reporter: easing/velocity audit across properties | P2 | 3 | |
| Motion-blur & frame-hold assist; poster-frame setter | P2 | 3 | |

### 5. Text & Captions — `text/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| SRT/VTT import → styled text layers (templates, safe-area, RTL/bidi) with idempotent re-sync | P0 | 3 | Caption workflows |
| SRT/VTT export from text layers/markers | P1 | 3 | |
| Text style library: capture/apply font+size+tracking+fill presets to selections | P0 | 2 | |
| Text tools: auto-fit box, case ops, find/replace with styles, animator presets | P1 | 2 | |
| Lorem/script-text filler, date/code placeholders | P2 | 3 | |
| Multi-line paste → layers / layer-split helpers | P1 | 2 | |

### 6. Shapes & Masks — `shapes/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Mask manager: list/rename/invert/feather/mode batch ops | P1 | 2 | |
| Shape library: reusable, parametric shape presets (tags, search) | P1 | 2 | |
| Boolean ops helper on shape paths (merge/subtract workflows) | P2 | 3 | Deterministic clones |
| Motion-path & trim-path assists; arrow/connector rig | P2 | 3 | |

### 7. Effects & Presets — `effects/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Effects browser: searchable AE effects (params indexed) + user presets (FFX) | P1 | 2 | |
| Effect-chain snapshot → shareable preset; apply chain to many layers/properties | P1 | 2 | |
| Copy/paste effects with rules (match by name, keep params) | P0 | 2 | |
| Property-linker: pickwhip helpers, expression-driven parameter rigs from UI | P2 | 3 | |
| GPU/CPU-heavy effect audit ("render cost hints") | P3 | 4 | Heuristic model |

### 8. Expressions — `expressions/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Expression workbench (Monaco): edit selected property expressions, snippets, linter | P1 | 2 | |
| Snippet library w/ variables, apply-to-selection, versioned | P0 | 2 | |
| JS ↔ Legacy expression engine conversion (best-effort + report) | P1 | 2 | Uses AE's own conversion where available |
| Expression error sweeper: list broken expressions + context | P0 | 1 | Part of Asset Doctor |
| Expression stats: which properties reference what (project graph) | P2 | 3 | Also powers find-replace safety |

### 9. Data-Driven Graphics — `data/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| CSV/JSON/Google-Sheets-watch → template comp variants (per row) | P1 | 3 | Sheets = sidecar watch via API token, opt-in |
| Chart builder: bar/line/pie/area, clean shape layers, axis styles, animation presets | P1 | 3 | Export-friendly |
| Data → keyframes (streams) with easing baked | P2 | 3 | |
| JSON schema validation + column mapping UI | P1 | 3 | |

### 10. Render Queue & Export — `render/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| RQ template library: OM/RS template sets as versioned presets; spec-pack per delivery (social/broadcast/prores) | P0 | 3 | Cross-platform path variables |
| Batch submit many comps/projects; queue cleanup & dedupe | P0 | 3 | |
| `aerender` CLI orchestration: job builder, progress parse, retry policy | P1 | 3 | Windows & macOS path auto-detect |
| LAN farm: OPERATOR Agents, WS hub, dashboard, ETA, triage links | P2 | 3 | Opt-in daemon, signed |
| Post-render: ffmpeg GIF/WebM/H.264/MP4 presets, LUT burn-in option, MD5 manifest | P1 | 3 | LGPL ffmpeg sidecar |
| Lottie/Bodymovin-style JSON export (via maintained exporter integration) | P2 | 4 | Scope carefully; big surface |
| Sequence/psd-layer & watch-folder auto-render flows | P2 | 3 | |
| Render cost estimator (project-complexity heuristic) | P3 | 4 | |

### 11. Timeline & Editors' Utilities — `timeline/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Timecode tools: calculators, trim/duration helpers, work-area batch | P1 | 2 | |
| Marker tools: batch add/named markers from CSV, colorize, export markers | P1 | 2 | |
| Beat-sync: sidecar audio analysis (onsets) → markers/keyframes | P2 | 3 | ffmpeg-assisted |
| Selection helpers: select by type/pattern/expression, isolate, invert-scoped | P0 | 1 | |

### 12. Color — `color/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Color swatch library synced across project (apply to fills/strokes/text) | P1 | 2 | |
| Hex/RGB picker in palette (`#ff0044` → apply to selection) | P0 | 1 | |
| Project color-management checker (working space vs footage) | P2 | 2 | Feeds Asset Doctor |
| LUT preview in panel (WebGL shader) before export | P3 | 4 | |

### 13. Team, Ops & Meta — `ops/` `sdk/`
| Feature | Pri | Phase | Notes |
|---|---|---|---|
| Scripting console: REPL to JSX with output history, safe eval only through registry | P0 | 1 | TD magnet |
| Macro recorder & editor (visual steps + JSON) | P1 | 2 | |
| Ops packs import/export, per-team shared library (folder-sync friendly) | P1 | 3 | No cloud required |
| Module SDK: manifests, permissions, hot-reload dev mode, versioned API | P2 | 5 | |
| In-app Ops library (curated signed packs) | P2 | 5 | Marketplace-lite |
| Audit log viewer + support bundle export | P1 | 2 | |
| Settings sync (keymaps/presets) via user-chosen folder (Dropbox/Drive) | P2 | 3 | Local-first |
| Localization of the panel (i18n framework from day 1; ship EN, DE, ES, FR, JA, PT-BR, zh-Hans) | P1 | 2 | RTL-aware UI |

## Command-registry size estimate

~120 commands by MVP (P0), ~260 by GA (P0+P1), ~350+ with P2. Registry overhead per
command is trivial (metadata object); palette scales via the index (doc 02 §6).

## Explicit anti-features (v1, restated)

No destructive default (everything dry-run/undo first) · no phone-home licensing
(offline keys) · no project-content telemetry · no auto-update of AE itself ·
no global keyboard hooks outside the panel · no bundled GPL binaries.
