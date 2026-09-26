/**
 * Ambient declarations for the ExtendScript host globals. The bundled runtime
 * is authored against these; tests and the in-process adapter inject the
 * same shapes explicitly instead (packages/ae-mock).
 */
import type { AeApplication } from "@operator/ae-types";

declare global {
  const app: AeApplication;

  interface OperatorDollar {
    os?: string;
    version?: string;
    _OP?: unknown;
  }

  const $: OperatorDollar;

  class ExternalObject {
    constructor(name: string);
    dispatchEvent(event: unknown): void;
  }

  class CSXSEvent {
    type: string;
    data: string;
  }
}

export {};
