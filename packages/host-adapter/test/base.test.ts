import { describe, expect, it } from "vitest";
import { makeAccepted, makeOk, type TaskEnvelope, type TaskRequest } from "@operator/protocol";
import { BaseHostAdapter, type HostInfo } from "../src/index.js";

class FakeAdapter extends BaseHostAdapter {
  sent: TaskRequest[] = [];
  cancelled: string[] = [];
  scripted: TaskEnvelope[] = [];
  warns: string[] = [];
  private handle: ((name: string, json: string) => void) | null = null;

  constructor(opts?: { taskTimeoutMs?: number }) {
    super({ taskTimeoutMs: opts?.taskTimeoutMs, logger: { warn: (m) => this.warns.push(m) } });
  }

  async info(): Promise<HostInfo> {
    return { host: "TEST", appVersion: "0", platform: "test", capabilities: {}, nodeAvailable: true };
  }

  protected async send(request: TaskRequest): Promise<TaskEnvelope> {
    this.sent.push(request);
    const next = this.scripted.shift();
    if (!next) throw new Error("no scripted envelope");
    return next;
  }

  protected async sendCancel(taskId: string): Promise<boolean> {
    this.cancelled.push(taskId);
    return true;
  }

  protected subscribe(handle: (name: string, json: string) => void): void {
    this.handle = handle;
  }

  emit(name: string, payload: unknown): void {
    this.handle?.(name, JSON.stringify(payload));
  }

  emitRaw(name: string, raw: string): void {
    this.handle?.(name, raw);
  }
}

const req = (id: string): TaskRequest => ({ id, module: "layers", fn: "renameBatch" });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("BaseHostAdapter task correlation", () => {
  it("resolves immediate results without events", async () => {
    const a = new FakeAdapter();
    a.scripted.push(makeOk("t-now", { renamed: 4 }));
    const result = await a.runTask(req("t-now"));
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ renamed: 4 });
  });

  it("resolves accepted tasks only when the done event arrives, and fans progress out", async () => {
    const a = new FakeAdapter();
    a.scripted.push(makeAccepted("t-batch"));
    const seen: number[] = [];
    const off = a.onProgress((p) => seen.push(p.done));

    const pending = a.runTask(req("t-batch"));
    await flush();
    a.emit("com.operator.task.progress", { taskId: "t-batch", done: 5, total: 10, phase: "running" });
    a.emit("com.operator.task.progress", { taskId: "t-batch", done: 10, total: 10, phase: "running" });
    a.emit("com.operator.task.done", makeOk("t-batch", { renamed: 10 }, { undoToken: "undo:t-batch" }));
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(seen).toEqual([5, 10]);

    off();
    a.emit("com.operator.task.progress", { taskId: "other", done: 1, total: 1, phase: "running" });
    expect(seen).toEqual([5, 10]);
  });

  it("ignores done events for unrelated tasks", async () => {
    const a = new FakeAdapter();
    a.scripted.push(makeAccepted("t-mine"));
    const pending = a.runTask(req("t-mine"));
    await flush();
    a.emit("com.operator.task.done", makeOk("t-not-mine", null));
    a.emit("com.operator.task.done", makeOk("t-mine", { fine: true }));
    await expect(pending).resolves.toMatchObject({ taskId: "t-mine", ok: true });
  });

  it("times out, cooperatively cancels, and tolerates the late done event", async () => {
    const a = new FakeAdapter({ taskTimeoutMs: 20 });
    a.scripted.push(makeAccepted("t-slow"));
    const pending = a.runTask(req("t-slow"));
    await expect(pending).rejects.toThrow(/timed out/);
    expect(a.cancelled).toContain("t-slow");
    a.emit("com.operator.task.done", makeOk("t-slow", null));
  });

  it("drops malformed event payloads with a warning", async () => {
    const a = new FakeAdapter();
    a.scripted.push(makeAccepted("t-json"));
    const pending = a.runTask(req("t-json"));
    await flush();
    a.emitRaw("com.operator.task.progress", "{not json");
    a.emitRaw("com.operator.task.done", "{not json");
    a.emit("com.operator.task.done", makeOk("t-json", null));
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(a.warns.length).toBe(2);
  });
});
