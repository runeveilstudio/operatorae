import type { AeApplication } from "@operator/ae-types";
import { BaseHostAdapter, type HostInfo } from "@operator/host-adapter";
import {
  TASK_DONE_EVENT,
  TASK_PROGRESS_EVENT,
  type TaskEnvelope,
  type TaskRequest
} from "@operator/protocol";
import { createOperator, type HandlerTable, type OperatorEnv } from "./core/operator.js";
import { handlerTable } from "./index.js";

/**
 * In-process HostAdapter: runs the REAL dispatcher core against an injected
 * AE DOM (packages/ae-mock in dev/tests) with timer-based chunk scheduling.
 * This is the host-agnostic proof that the command layer needs no CEP to
 * function (docs/06 §1 rule) and powers the panel's browser dev mode.
 */
export class InProcessHostAdapter extends BaseHostAdapter {
  private readonly op: ReturnType<typeof createOperator>;
  private handle: ((eventName: string, dataJson: string) => void) | null = null;

  constructor(
    app: AeApplication,
    platform = "In-process mock host",
    handlers?: HandlerTable
  ) {
    super();
    const self = this;
    const env: OperatorEnv = {
      app: app,
      platform: platform,
      eventsAvailable: true,
      emit: (type, payloadJson) => {
        if (self.handle) self.handle(type, payloadJson);
      },
      scheduleTick: (_taskId, continueFn) => {
        setTimeout(() => continueFn(), 0);
      },
      now: () => Date.now()
    };
    this.op = createOperator(env, handlers ?? handlerTable());
  }

  async info(): Promise<HostInfo> {
    const probe = this.op.probe();
    return {
      host: "MOCK",
      appVersion: probe.appVersion,
      platform: probe.platform,
      capabilities: probe.capabilities,
      projectPath: probe.projectPath,
      nodeAvailable: false
    };
  }

  protected async send(request: TaskRequest): Promise<TaskEnvelope> {
    return JSON.parse(this.op.run(JSON.stringify(request))) as TaskEnvelope;
  }

  protected async sendCancel(taskId: string): Promise<boolean> {
    return this.op.cancel(taskId);
  }

  protected subscribe(handle: (eventName: string, dataJson: string) => void): void {
    this.handle = handle;
  }
}

export { TASK_DONE_EVENT, TASK_PROGRESS_EVENT };
