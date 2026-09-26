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
          { name: "headline text" },
          { name: "subhead text" },
          { name: "vignette" }
        ]
      },
      { name: "TITLE_9x16", layers: [{ name: "bg" }, { name: "headline text" }] },
      { name: "LOWER_THIRDS", layers: [{ name: "bar" }, { name: "name text" }] }
    ],
    footage: [
      { name: "logo.ai" },
      { name: "hero_shot_010.mov" },
      { name: "hero_shot_011.mov" },
      { name: "missing_render.mov", missing: true }
    ]
  });
  return new InProcessHostAdapter(env.app, "Dev mock (no CEP)");
}
