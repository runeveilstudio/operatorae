import { CAPABILITIES, TASK_ERROR_CODES, type TaskRequest, type TaskResult } from "@operator/protocol";
import type { HostAdapter, HostInfo } from "@operator/host-adapter";
import type { CommandDef } from "./types.js";
import type { CommandRegistry } from "./registry.js";
import type { AuditSink } from "./audit.js";

/** Sidecar port — implemented by apps/sidecar; null = Limited mode (docs/02 §7). */
export interface SnapshotPort {
  writeSnapshot(input: SnapshotInput): Promise<SnapshotInfo>;
}

export interface SnapshotInput {
  projectPath: string;
  reason: string;
  items?: unknown[];
}

export interface SnapshotInfo {
  id: string;
  manifestPath: string;
}

export interface RunOutcome {
  command: CommandDef;
  result: TaskResult;
  snapshotId: string | null;
}

export interface RunOptions {
  dryRun?: boolean;
  chunkSize?: number;
  timeoutMs?: number;
}

export interface RunnerDeps {
  snapshot?: SnapshotPort | null;
}

let sequence = 0;

/**
 * CommandRunner is the panel's single funnel into the host:
 * capability gate → pre-op snapshot for mutating batch ops → task dispatch →
 * audit entry (docs/02 §3 walkthrough A).
 */
export class CommandRunner {
  private infoPromise: Promise<HostInfo> | null = null;

  constructor(
    private readonly adapter: HostAdapter,
    private readonly registry: CommandRegistry,
    private readonly audit: AuditSink,
    private readonly deps: RunnerDeps = {}
  ) {}

  invalidateInfo(): void {
    this.infoPromise = null;
  }

  /** Progress passthrough for UI views (chunked task progress fan-out). */
  onProgress(cb: (payload: import("@operator/protocol").TaskProgressPayload) => void): () => void {
    return this.adapter.onProgress(cb);
  }

  async run(commandId: string, args?: Record<string, unknown>, opts?: RunOptions): Promise<RunOutcome> {
    const command = this.registry.get(commandId);
    const dryRun = opts?.dryRun ?? false;
    const startedAt = Date.now();

    // Capability gate: disable, never hide (docs/02 §2.3 capabilities registry).
    if (command.capability) {
      const info = await this.ensureInfo();
      if (!info.capabilities[command.capability]) {
        const result: TaskResult = {
          taskId: commandId,
          ok: false,
          data: null,
          errors: [
            {
              code: TASK_ERROR_CODES.CAPABILITY_MISSING,
              message: `This host lacks capability "${command.capability}" — command disabled (docs/02 §7).`
            }
          ]
        };
        this.audit.append({
          ts: startedAt,
          commandId,
          taskId: commandId,
          ok: false,
          errorCodes: [TASK_ERROR_CODES.CAPABILITY_MISSING],
          dryRun
        });
        return { command, result, snapshotId: null };
      }
    }

    // Never destroy (docs/01 pillar 3): mutating batch ops snapshot first.
    let snapshotId: string | null = null;
    let snapshotFailed = false;
    if (command.mutating && !dryRun && this.deps.snapshot) {
      try {
        const info = await this.ensureInfo();
        const snap = await this.deps.snapshot.writeSnapshot({
          projectPath: info.projectPath ?? "",
          reason: commandId
        });
        snapshotId = snap.id;
      } catch (e) {
        snapshotFailed = true;
        snapshotId = null;
      }
    }

    const request: TaskRequest = {
      id: `${commandId}:${Date.now().toString(36)}:${(sequence++).toString(36)}`,
      module: command.module,
      fn: command.fn,
      args: args ?? null,
      meta: {
        dryRun,
        chunkSize: opts?.chunkSize,
        snapshotId
      }
    };

    let result: TaskResult;
    try {
      result = await this.adapter.runTask(request, { timeoutMs: opts?.timeoutMs });
    } catch (e) {
      this.audit.append({
        ts: startedAt,
        commandId,
        taskId: request.id,
        ok: false,
        snapshotId,
        snapshotFailed,
        dryRun,
        errorCodes: ["TRANSPORT"]
      });
      throw e;
    }

    this.audit.append({
      ts: startedAt,
      commandId,
      taskId: request.id,
      ok: result.ok,
      durationMs: result.durationMs,
      undoToken: result.undoToken ?? null,
      snapshotId,
      snapshotFailed,
      dryRun,
      errorCodes: result.errors?.map((e) => e.code)
    });

    return { command, result, snapshotId };
  }

  private ensureInfo(): Promise<HostInfo> {
    if (!this.infoPromise) {
      this.infoPromise = this.adapter.info().catch((e) => {
        this.infoPromise = null;
        throw e;
      });
    }
    return this.infoPromise;
  }
}

export { CAPABILITIES };
