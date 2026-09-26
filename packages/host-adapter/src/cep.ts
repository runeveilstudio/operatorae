import {
  PROTOCOL_VERSION,
  TASK_DONE_EVENT,
  TASK_PROGRESS_EVENT,
  type TaskEnvelope,
  type TaskRequest
} from "@operator/protocol";
import { BaseHostAdapter } from "./base.js";
import type { AdapterOptions, HostInfo } from "./types.js";

/**
 * Minimal direct binding to CEP globals — we deliberately do NOT vendor
 * Adobe's CSInterface.js; we use only the surface we need from
 * window.__adobe_cep__ (docs/08: swap to a vendored CSInterface if the
 * surface grows).
 */

export interface CepEvent {
  type: string;
  data?: string;
  scope?: unknown;
}

export interface CepHostEnvironment {
  appId?: string;
  appName?: string;
  appVersion?: string;
  appLocale?: string;
}

export interface CepGlobal {
  evalScript(script: string, callback?: (result: string) => void): void;
  addEventListener(type: string, listener: (event: CepEvent) => void): void;
  getHostEnvironment?(): CepHostEnvironment | null;
  /** pathId is a string, e.g. "extension" (CSInterface.SystemPath.EXTENSION). */
  getSystemPath?(pathId: string): string;
  getOSInformation?(): string;
}

export function getCepGlobal(win?: { __adobe_cep__?: CepGlobal }): CepGlobal | null {
  const w = win ?? (typeof globalThis !== "undefined" ? (globalThis as never) : undefined);
  const g = w?.__adobe_cep__;
  return g ? g : null;
}

export interface CEPAdapterConfig {
  /** Extension root; defaults to cep.getSystemPath("extension"). */
  extensionDir?: string;
  /** Explicit path to operator.jsx; defaults to `${extensionDir}/operator.jsx`. */
  jsxBundlePath?: string;
}

interface PingResult {
  pong: boolean;
  protocol: string;
}

interface ProbeData {
  appVersion: string;
  platform: string;
  projectPath?: string | null;
  capabilities: Record<string, boolean>;
}

export class CEPHostAdapter extends BaseHostAdapter {
  private readonly config: CEPAdapterConfig;
  private loadedRuntime: Promise<void> | null = null;
  private cachedInfo: HostInfo | null = null;

  constructor(
    private readonly cep: CepGlobal,
    config: CEPAdapterConfig = {},
    opts?: AdapterOptions
  ) {
    super(opts);
    this.config = config;
  }

  async info(): Promise<HostInfo> {
    if (this.cachedInfo) return this.cachedInfo;
    const hostEnv = this.cep.getHostEnvironment?.() ?? null;
    const probeResult = await this.runTask({
      id: "system.probe",
      module: "system",
      fn: "probe",
      args: null
    });
    const probe = (probeResult.data ?? {}) as ProbeData;
    this.cachedInfo = {
      host: hostEnv?.appName ?? "AEFT",
      appVersion: probe.appVersion || hostEnv?.appVersion || "unknown",
      platform: probe.platform || this.cep.getOSInformation?.() || "unknown",
      capabilities: probe.capabilities ?? {},
      projectPath: probe.projectPath ?? null,
      // Degradation ladder (docs/02 §7): sidecar features disable, not vanish.
      nodeAvailable: typeof require === "function"
    };
    return this.cachedInfo;
  }

  /** Load the ES3 runtime bundle into the session engine and handshake. */
  async loadRuntime(explicitPath?: string): Promise<void> {
    const bundlePath = explicitPath ?? this.jsxBundlePath();
    if (!bundlePath) {
      throw new Error(
        "OPERATOR: cannot locate operator.jsx — pass jsxBundlePath or run inside CEP with getSystemPath available"
      );
    }
    // Paths travel as JSON-escaped strings, never string-concatenated source
    // (docs/04 §3 rule 5). JSON string escaping is ExtendScript-compatible.
    // $.evalFile returns void ("") — allowed; the ping below must answer JSON.
    await this.evalScript(`$.evalFile(${JSON.stringify(bundlePath)})`, { allowEmpty: true });
    const pong = await this.evalScript<PingResult>("$._OP.ping()");
    if (!pong || pong.pong !== true) {
      throw new Error("OPERATOR: runtime loaded but did not answer ping — see docs/08 §QA");
    }
    if (pong.protocol !== PROTOCOL_VERSION) {
      throw new Error(
        `OPERATOR protocol mismatch: panel expects ${PROTOCOL_VERSION}, runtime reports ${pong.protocol} — rebuild apps/jsx and reload the panel`
      );
    }
  }

  protected async send(request: TaskRequest): Promise<TaskEnvelope> {
    await this.ensureRuntime();
    return this.evalScript<TaskEnvelope>(JSON.stringify(request));
  }

  protected async sendCancel(taskId: string): Promise<boolean> {
    await this.ensureRuntime();
    const cancelled = await this.evalScript<boolean>(
      `$._OP.cancel(${JSON.stringify(taskId)})`
    );
    return cancelled === true;
  }

  protected subscribe(handle: (eventName: string, dataJson: string) => void): void {
    this.cep.addEventListener(TASK_DONE_EVENT, (e) =>
      handle(TASK_DONE_EVENT, e?.data ?? "")
    );
    this.cep.addEventListener(TASK_PROGRESS_EVENT, (e) =>
      handle(TASK_PROGRESS_EVENT, e?.data ?? "")
    );
  }

  private ensureRuntime(): Promise<void> {
    if (!this.loadedRuntime) {
      this.loadedRuntime = this.loadRuntime().catch((e) => {
        this.loadedRuntime = null; // allow retry after a transient failure
        throw e;
      });
    }
    return this.loadedRuntime;
  }

  private jsxBundlePath(): string | null {
    const explicit = this.config.jsxBundlePath;
    if (explicit) return explicit;
    const dir = this.config.extensionDir ?? this.cep.getSystemPath?.("extension") ?? null;
    return dir ? `${dir}/operator.jsx` : null;
  }

  private evalScript<T>(script: string, opts?: { allowEmpty?: boolean }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      this.cep.evalScript(script, (result) => {
        if (settled) return;
        settled = true;
        if (typeof result !== "string" || (result === "" && opts?.allowEmpty !== true) || result === "EvalScript error.") {
          reject(
            new Error(
              `OPERATOR transport error: ExtendScript evaluation failed for ${script.slice(0, 80)}… (${result})`
            )
          );
          return;
        }
        if (result === "") {
          resolve(undefined as T);
          return;
        }
        try {
          resolve(JSON.parse(result) as T);
        } catch (e) {
          reject(
            new Error(`OPERATOR transport error: malformed JSON from host: ${result.slice(0, 200)}`)
          );
        }
      });
    });
  }
}
