import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  makeAccepted,
  makeOk,
  type TaskRequest
} from "@operator/protocol";
import { CEPHostAdapter, type CepEvent, type CepGlobal } from "../src/index.js";

class FakeCep implements CepGlobal {
  scripts: string[] = [];
  listeners = new Map<string, ((e: CepEvent) => void)[]>();
  respond: (script: string) => string;

  constructor(respond: (script: string) => string) {
    this.respond = respond;
  }

  evalScript(script: string, callback?: (result: string) => void): void {
    this.scripts.push(script);
    if (!callback) return;
    Promise.resolve().then(() => callback(this.respond(script)));
  }

  addEventListener(type: string, listener: (e: CepEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatch(type: string, dataJson: string): void {
    for (const l of this.listeners.get(type) ?? []) l({ type, data: dataJson });
  }

  getHostEnvironment() {
    return { appName: "AEFT", appVersion: "26.0.2" };
  }

  getSystemPath(pathId: string): string {
    return pathId === "extension" ? "/ext/dir" : "";
  }

  getOSInformation(): string {
    return "Mac OS X";
  }
}

const probeResult = JSON.stringify(
  makeOk("system.probe", {
    engine: "ExtendScript",
    appVersion: "26.0.2",
    platform: "Mac OS X",
    capabilities: { "ae.project": true }
  })
);

function standardResponder(cep: FakeCep): (script: string) => string {
  return (script) => {
    if (script.includes("$.evalFile")) return "";
    if (script.includes("$._OP.ping()")) {
      return JSON.stringify({ pong: true, protocol: PROTOCOL_VERSION });
    }
    if (script.includes("$._OP.cancel")) return "true";
    if (script.trim().startsWith("{")) {
      const request = JSON.parse(script) as TaskRequest;
      if (request.fn === "probe") return probeResult;
      if (request.fn === "renameBatch") {
        setTimeout(() => {
          cep.dispatch(
            "com.operator.task.progress",
            JSON.stringify({
              taskId: request.id,
              done: 2,
              total: 4,
              phase: "running"
            })
          );
          cep.dispatch("com.operator.task.done", JSON.stringify(makeOk(request.id, { renamed: 4 })));
        }, 0);
        return JSON.stringify(makeAccepted(request.id));
      }
      return JSON.stringify(makeOk(request.id, { fn: request.fn }));
    }
    return "EvalScript error.";
  };
}

describe("CEPHostAdapter", () => {
  it("loads the runtime once, escapes paths as JSON strings, then runs tasks", async () => {
    const cep = new FakeCep(() => "");
    cep.respond = standardResponder(cep);
    const adapter = new CEPHostAdapter(cep, {});
    const result = await adapter.runTask({
      id: "t-1",
      module: "project",
      fn: "info"
    });
    expect(result.ok).toBe(true);
    expect(cep.scripts[0]).toBe('$.evalFile("/ext/dir/operator.jsx")');
    // Only one evalFile despite multiple tasks.
    await adapter.runTask({ id: "t-2", module: "comps", fn: "list" });
    expect(cep.scripts.filter((s) => s.includes("$.evalFile")).length).toBe(1);
  });

  it("escapes Windows paths correctly in $.evalFile", async () => {
    const cep = new FakeCep(() => "");
    cep.respond = standardResponder(cep);
    const adapter = new CEPHostAdapter(cep, { jsxBundlePath: "C:\\Program Files\\ext\\operator.jsx" });
    await adapter.runTask({ id: "t-w", module: "project", fn: "info" });
    expect(cep.scripts[0]).toBe('$.evalFile("C:\\\\Program Files\\\\ext\\\\operator.jsx")');
  });

  it("resolves chunked tasks through progress and done events", async () => {
    const cep = new FakeCep(() => "");
    cep.respond = standardResponder(cep);
    const adapter = new CEPHostAdapter(cep, {});
    const events: number[] = [];
    adapter.onProgress((p) => events.push(p.done));
    const result = await adapter.runTask({
      id: "t-batch",
      module: "layers",
      fn: "renameBatch",
      args: { scope: "selection" }
    });
    expect(result.ok).toBe(true);
    expect(events).toEqual([2]);
  });

  it("rejects transport errors and stale protocol runtimes", async () => {
    const oldProtocol = new FakeCep(() => JSON.stringify({ pong: true, protocol: "0.0.9" }));
    const adapter = new CEPHostAdapter(oldProtocol, { jsxBundlePath: "/x/operator.jsx" });
    await expect(adapter.runTask({ id: "t-old", module: "project", fn: "info" })).rejects.toThrow(
      /protocol mismatch/
    );

    const evalError = new FakeCep(() => "EvalScript error.");
    const adapter2 = new CEPHostAdapter(evalError, { jsxBundlePath: "/x/operator.jsx" });
    await expect(adapter2.runTask({ id: "t-err", module: "project", fn: "info" })).rejects.toThrow(
      /ExtendScript evaluation failed/
    );
  });

  it("reports host info from the probe + CEP environment", async () => {
    const cep = new FakeCep(() => "");
    cep.respond = standardResponder(cep);
    const adapter = new CEPHostAdapter(cep, {});
    const info = await adapter.info();
    expect(info.host).toBe("AEFT");
    expect(info.appVersion).toBe("26.0.2");
    expect(info.capabilities["ae.project"]).toBe(true);
  });

  it("cancelTask reaches the runtime with a JSON-escaped id", async () => {
    const cep = new FakeCep(() => "");
    cep.respond = standardResponder(cep);
    const adapter = new CEPHostAdapter(cep, {});
    expect(await adapter.cancelTask("t-x")).toBe(true);
    expect(cep.scripts.some((s) => s === '$._OP.cancel("t-x")')).toBe(true);
  });
});
