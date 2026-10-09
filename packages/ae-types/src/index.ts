/**
 * Hand-curated typings for the After Effects scripting DOM surface OPERATOR
 * touches (docs/02 §2.3 module map). Grows command by command; every quirk is
 * captured here so apps/jsx and packages/ae-mock share one source of truth
 * (docs/05 R10: quirk knowledge lives in the repo, not in heads).
 *
 * Imported TYPE-ONLY by apps/jsx (erased at compile → no runtime dependency in
 * the ES3 bundle) and imported structurally by packages/ae-mock.
 *
 * Documented AE quirks honored across these files:
 *  - Collections are 1-indexed: item(i)/layer(i), counts are numItems/numLayers.
 *  - LayerCollection has no `.length`; always iterate numLayers.
 *  - comp.selectedLayers / project.selection return real JS Arrays.
 *  - app.project.fileURI is a percent-encoded URI string, not a File object.
 *  - Property lookup is by matchName (locale-proof), never display name alone.
 */

export * from "./properties.js";
export * from "./items.js";
export * from "./layers.js";
export * from "./app.js";
