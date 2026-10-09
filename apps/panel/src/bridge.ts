import { getCepGlobal, CEPHostAdapter, type HostAdapter } from "@operator/host-adapter";

/**
 * Adapter selection (docs/02 §1): inside CEP we bind window.__adobe_cep__
 * directly; in a plain browser (vite dev) we fall back to the in-process
 * adapter running the REAL dispatcher core against the mock AE DOM. The mock
 * is a dynamic import, so production bundles never load it in CEP.
 */
let adapterPromise: Promise<HostAdapter> | null = null;

export function getAdapter(): Promise<HostAdapter> {
  if (!adapterPromise) {
    adapterPromise = createAdapter().catch((e) => {
      adapterPromise = null;
      throw e;
    });
  }
  return adapterPromise;
}

async function createAdapter(): Promise<HostAdapter> {
  const cep = getCepGlobal();
  if (cep) {
    return new CEPHostAdapter(cep);
  }
  const [{ InProcessHostAdapter }, { createMockAeEnv }] = await Promise.all([
    import("@operator/jsx/inproc"),
    import("@operator/ae-mock")
  ]);
  const env = createMockAeEnv({
    fileURI: "file:///Users/artist/Projects/demo%20reel.aep",
    comps: [
      {
        name: "TITLE_16x9",
        active: true,
        layers: [
          { name: "bg", selected: true },
          { name: "logo", selected: true },
          { name: "locked matte", selected: true, locked: true },
          {
            name: "headline text",
            props: [
              { name: "Source Text", matchName: "ADBE Text Document", expression: '"OPERATOR"' }
            ]
          },
          { name: "subhead text" },
          {
            name: "vignette",
            props: [
              {
                name: "Opacity",
                matchName: "ADBE Opacity",
                expression: "wiggle(2, 10",
                expressionError: "After Effects error: syntax error"
              }
            ]
          }
        ]
      },
      { name: "TITLE_9x16", layers: [{ name: "bg" }, { name: "headline text" }] },
      { name: "LOWER_THIRDS", layers: [{ name: "bar" }, { name: "name text" }] }
    ],
    footage: [
      { name: "logo.ai" },
      { name: "hero_shot_010.mov" },
      { name: "hero_shot_011.mov" },
      { name: "missing_render.mov", missing: true },
      { name: "Solid Black", solid: true }
    ]
  });
  // Wire layer sources so the Asset Doctor's "unused" check has real usage:
  // bg pulls hero_shot_010, logo pulls logo.ai; hero_shot_011 + the solid stay
  // unused and missing_render is missing (also unused — both are true).
  const byName = (n: string) => env.items.find((i) => i.name === n) ?? null;
  env.comps[0]._layers[0].source = byName("hero_shot_010.mov");
  env.comps[0]._layers[1].source = byName("logo.ai");
  return new InProcessHostAdapter(env.app, "Dev mock (no CEP)");
}
