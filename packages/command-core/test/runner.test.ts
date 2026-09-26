import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CommandNotFoundError,
  CommandRegistry,
  CommandRunner,
  InMemoryAuditSink,
  type CommandDef,
  type SnapshotInput
} from "../src/index.js";
import { makeOk, type TaskRequest, type TaskResult } from "@operator/protocol";
import type { HostAdapter, HostInfo } from "@operator/host-adapter";

class FakeHost implements HostAdapter {
  requests: TaskRequest[] = [];
  infoResult: HostInfo;
  taskResult: TaskResult = makeOk("stub", { done: true });

  constructor(capabilities: Record<string, boolean> = {}) {
    this.infoResult = {
      host: "AEFT",
      appVersion: "26.0",
      platform: "test",
      capabilities,
      projectPath: "/proj/night.aep",
      nodeAvailable: true
    };
  }

  info(): Promise<HostInfo> {
    return Promise.resolve(this.infoResult);
  }
  runTask(request: TaskRequest): Promise<TaskResult> {
    this.requests.push(request);
    return Promise.resolve({ ...this.taskResult, taskId: request.id });
  }
  cancelTask(): Promise<boolean> {
    return Promise.resolve(true);
  }
  onProgress(): () => void {
    return () => undefined;
  }
  close(): void {}
}

const def = (over: Partial<CommandDef>): CommandDef => ({
  id: "x.y",
  title: "X Y",
  module: "layers",
  fn: "y",
  scope: "selection",
  mutating: false,
  batch: false,
  category: "Test",
  ...over
});

function setup(capabilities: Record<string, boolean> = {}) {
  const registry = new CommandRegistry();
  registry.register(def({ id: "layers.renameBatch", title: "Batch rename", mutating: true, batch: true }));
  registry.register(def({ id: "project.info", title: "Project info", scope: "project" }));
  registry.register(
    def({ id: "comps.list", title: "List comps", scope: "project", capability: CAPABILITIES.ACTIVE_COMP })
  );
  const host = new FakeHost(capabilities);
  const audit = new InMemoryAuditSink();
  const snapshots: SnapshotInput[] = [];
  const runner = new CommandRunner(host, registry, audit, {
    snapshot: {
      writeSnapshot: (input) => {
        snapshots.push(input);
        return Promise.resolve({ id: `snap-${snapshots.length}`, manifestPath: "/tmp/m.json" });
      }
    }
  });
  return { registry, host, audit, snapshots, runner };
}

describe("CommandRunner", () => {
  it("snapshots before mutating ops and threads the id into the task", async () => {
    const { runner, snapshots, host, audit } = setup();
    const outcome = await runner.run("layers.renameBatch", { scope: "selection" });
    expect(outcome.snapshotId).toBe("snap-1");
    expect(snapshots[0]).toMatchObject({
      projectPath: "/proj/night.aep",
      reason: "layers.renameBatch"
    });
    expect(host.requests[0].meta?.snapshotId).toBe("snap-1");
    expect(audit.entries[0]).toMatchObject({
      commandId: "layers.renameBatch",
      ok: true,
      snapshotId: "snap-1"
    });
  });

  it("never snapshots dry runs or read-only commands", async () => {
    const { runner, snapshots } = setup();
    await runner.run("layers.renameBatch", { scope: "selection" }, { dryRun: true });
    expect(snapshots.length).toBe(0);
    await runner.run("project.info");
    expect(snapshots.length).toBe(0);
  });

  it("gates commands on missing capabilities and audits the block", async () => {
    const { runner, host, audit } = setup({});
    const outcome = await runner.run("comps.list");
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.errors?.[0].code).toBe("TASK_CAPABILITY_MISSING");
    expect(host.requests.length).toBe(0);
    expect(audit.entries[0].ok).toBe(false);
  });

  it("audits snapshot failure but still runs the command (Limited mode)", async () => {
    const registry = new CommandRegistry();
    registry.register(def({ id: "layers.renameBatch", mutating: true, batch: true }));
    const audit = new InMemoryAuditSink();
    const runner = new CommandRunner(new FakeHost(), registry, audit, {
      snapshot: {
        writeSnapshot: () => Promise.reject(new Error("no node"))
      }
    });
    const outcome = await runner.run("layers.renameBatch", { scope: "selection" });
    expect(outcome.snapshotId).toBeNull();
    expect(audit.entries[0].snapshotFailed).toBe(true);
    expect(outcome.result.ok).toBe(true);
  });

  it("propagates unknown-command errors", async () => {
    const { runner } = setup();
    await expect(runner.run("nope.nothing")).rejects.toBeInstanceOf(CommandNotFoundError);
  });

  it("propagates transport failures after auditing", async () => {
    const registry = new CommandRegistry();
    registry.register(def({ id: "project.info", scope: "project" }));
    const audit = new InMemoryAuditSink();
    const failing: HostAdapter = {
      info: () =>
        Promise.resolve({
          host: "AEFT",
          appVersion: "26",
          platform: "t",
          capabilities: {},
          nodeAvailable: false
        }),
      runTask: () => Promise.reject(new Error("boom")),
      cancelTask: () => Promise.resolve(false),
      onProgress: () => () => undefined,
      close: () => undefined
    };
    const runner = new CommandRunner(failing, registry, audit);
    await expect(runner.run("project.info")).rejects.toThrow("boom");
    expect(audit.entries[0]).toMatchObject({ ok: false, errorCodes: ["TRANSPORT"] });
  });
});
