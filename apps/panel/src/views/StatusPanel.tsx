import type { InMemoryAuditSink, CommandRegistry } from "@operator/command-core";
import type { HostInfo } from "@operator/host-adapter";

interface Props {
  info: HostInfo;
  audit: InMemoryAuditSink;
  registry: CommandRegistry;
}

export default function StatusPanel({ info, audit, registry }: Props) {
  const capabilities = Object.entries(info.capabilities);
  const recent = audit.entries.slice().reverse().slice(0, 10);
  return (
    <section className="op-status">
      <h3>Status</h3>
      <dl className="op-kv">
        <dt>Project</dt>
        <dd>{info.projectPath ?? "none"}</dd>
        <dt>Platform</dt>
        <dd>{info.platform}</dd>
        <dt>Node sidecar</dt>
        <dd>{info.nodeAvailable ? "available" : "Limited mode (docs/02 §7)"}</dd>
        <dt>Commands</dt>
        <dd>
          {registry.all().length} registered in {registry.categories().length} categories
        </dd>
      </dl>
      <h3>Capabilities (feature-detected)</h3>
      <ul className="op-caps">
        {capabilities.map(([key, ok]) => (
          <li key={key} className={ok ? "op-cap-ok" : "op-cap-missing"}>
            {key}: {ok ? "ok" : "missing"}
          </li>
        ))}
      </ul>
      <h3>Audit log</h3>
      {recent.length === 0 ? (
        <p className="op-dim">No commands run yet.</p>
      ) : (
        <ul className="op-audit">
          {recent.map((e, i) => (
            <li key={`${e.ts}-${i}`}>
              {new Date(e.ts).toLocaleTimeString()} · {e.commandId} · {e.ok ? "ok" : "failed"}
              {e.dryRun ? " (dry run)" : ""}
              {e.snapshotFailed ? " · snapshot failed" : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
