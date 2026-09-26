import {
  isAccepted,
  TASK_DONE_EVENT,
  TASK_PROGRESS_EVENT,
  type TaskEnvelope,
  type TaskProgressPayload,
  type TaskRequest,
  type TaskResult
} from "@operator/protocol";
import {
  DEFAULT_TASK_TIMEOUT_MS,
  type AdapterOptions,
  type HostAdapter,
  type HostInfo,
  type RunTaskOptions
} from "./types.js";

interface PendingTask {
  resolve: (result: TaskResult) => void;
  cleanup: () => void;
}

/**
 * Shared task-correlation logic for all adapters:
 *  - immediate results resolve directly;
 *  - accepted (chunked) tasks resolve when the matching done event arrives;
 *  - progress events fan out to subscribers;
 *  - timeouts cooperatively cancel and reject with a transport error.
 * Subclasses implement only transport (send/subscribe) + info().
 */
export abstract class BaseHostAdapter implements HostAdapter {
  protected readonly taskTimeoutMs: number;
  protected readonly logger: AdapterOptions["logger"];
  private readonly pending = new Map<string, PendingTask>();
  private readonly progressCallbacks = new Set<(p: TaskProgressPayload) => void>();
  private wired: Promise<void> | null = null;

  protected constructor(opts?: AdapterOptions) {
    this.taskTimeoutMs = opts?.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.logger = opts?.logger ?? { warn: (m) => console.warn(m) };
  }

  abstract info(): Promise<HostInfo>;

  /** Transport: evaluate a task on the host; resolves with its envelope. */
  protected abstract send(request: TaskRequest): Promise<TaskEnvelope>;
  /** Transport: ask the host to cancel; resolves false if not cancellable. */
  protected abstract sendCancel(taskId: string): Promise<boolean>;
  /** Transport: subscribe to operator events; call `handle(name, dataJson)`. */
  protected abstract subscribe(
    handle: (eventName: string, dataJson: string) => void
  ): void | Promise<void>;

  async runTask(request: TaskRequest, runOpts?: RunTaskOptions): Promise<TaskResult> {
    await this.ensureEvents();
    const envelope = await this.send(request);
    if (!isAccepted(envelope)) {
      return envelope as TaskResult;
    }
    const timeoutMs = runOpts?.timeoutMs ?? this.taskTimeoutMs;
    return new Promise<TaskResult>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(request.id);
          void this.sendCancel(request.id).catch(() => undefined);
          reject(
            new Error(
              `OPERATOR transport error: task ${request.id} timed out after ${timeoutMs}ms (cooperative cancel sent)`
            )
          );
        }, timeoutMs);
      }
      this.pending.set(request.id, {
        resolve,
        cleanup: () => {
          if (timer !== null) clearTimeout(timer);
        }
      });
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    // Stop the timeout timer but KEEP the pending resolver: our runtime
    // contract guarantees a final done event even after cancellation, and the
    // caller is awaiting that final (ok:false / CANCELLED) envelope.
    const pendingTask = this.pending.get(taskId);
    if (pendingTask) {
      pendingTask.cleanup();
    }
    return this.sendCancel(taskId);
  }

  onProgress(cb: (p: TaskProgressPayload) => void): () => void {
    this.progressCallbacks.add(cb);
    return () => {
      this.progressCallbacks.delete(cb);
    };
  }

  close(): void {
    for (const pendingTask of this.pending.values()) pendingTask.cleanup();
    this.pending.clear();
    this.progressCallbacks.clear();
  }

  protected async ensureEvents(): Promise<void> {
    if (!this.wired) {
      this.wired = Promise.resolve(
        this.subscribe((name, dataJson) => this.handleEvent(name, dataJson))
      ).then(() => undefined);
    }
    await this.wired;
  }

  protected handleEvent(eventName: string, dataJson: string): void {
    if (eventName === TASK_DONE_EVENT) {
      const result = this.parseJson(eventName, dataJson) as TaskResult | null;
      if (!result || typeof result.taskId !== "string") return;
      const pendingTask = this.pending.get(result.taskId);
      if (pendingTask) {
        pendingTask.cleanup();
        this.pending.delete(result.taskId);
        pendingTask.resolve(result);
      }
    } else if (eventName === TASK_PROGRESS_EVENT) {
      const payload = this.parseJson(eventName, dataJson) as TaskProgressPayload | null;
      if (!payload || typeof payload.taskId !== "string") return;
      for (const cb of this.progressCallbacks) cb(payload);
    }
  }

  private parseJson(eventName: string, dataJson: string): unknown | null {
    try {
      return JSON.parse(dataJson);
    } catch (e) {
      this.logger?.warn(`Dropping malformed ${eventName} event: ${String(e)}`);
      return null;
    }
  }
}
