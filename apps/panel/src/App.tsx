import { useEffect, useMemo, useState } from "react";
import { CommandRunner, InMemoryAuditSink, type CommandRegistry } from "@operator/command-core";
import type { HostAdapter, HostInfo } from "@operator/host-adapter";
import { getAdapter } from "./bridge";
import { createCatalog } from "./commands/catalog";
import OperatorBar from "./views/OperatorBar";
import StatusPanel from "./views/StatusPanel";
import AssetDoctor from "./views/AssetDoctor";

interface BootState {
  adapter: HostAdapter;
  info: HostInfo;
}

export default function App() {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const registry: CommandRegistry = useMemo(() => createCatalog(), []);
  const audit = useMemo(() => new InMemoryAuditSink(), []);
  const runner = useMemo(
    () => (boot ? new CommandRunner(boot.adapter, registry, audit) : null),
    [boot, registry, audit]
  );

  useEffect(() => {
    let alive = true;
    getAdapter()
      .then(async (adapter) => {
        const info = await adapter.info();
        if (alive) setBoot({ adapter, info });
      })
      .catch((e) => {
        if (alive) setError(String((e as Error)?.message ?? e));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <div className="op-boot op-boot-error">OPERATOR failed to start: {error}</div>;
  }
  if (!boot || !runner) {
    return <div className="op-boot">OPERATOR starting…</div>;
  }
  return (
    <div className="op-panel">
      <header className="op-header">
        <span className="op-title">OPERATOR</span>
        <span className="op-host">
          {boot.info.host} {boot.info.appVersion} · {boot.info.nodeAvailable ? "full" : "limited mode"}
        </span>
      </header>
      <OperatorBar runner={runner} registry={registry} info={boot.info} />
      <AssetDoctor runner={runner} />
      <StatusPanel info={boot.info} audit={audit} registry={registry} />
    </div>
  );
}
