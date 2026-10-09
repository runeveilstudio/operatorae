import { useEffect, useState } from "react";
import type { CommandRunner } from "@operator/command-core";
import type { TaskProgressPayload } from "@operator/protocol";

/** Mirror of the DoctorScanData shape returned by apps/jsx doctorScan. */
interface DoctorReport {
  projectPath: string | null;
  appVersion: string;
  scanned: { items: number; comps: number; layers: number; expressions: number };
  counts: { missing: number; unused: number; brokenExpressions: number };
  missing: Array<{ itemId: number; name: string; path: string; folder: string; reason: string }>;
  unused: Array<{ itemId: number; name: string; kind: string; folder: string }>;
  brokenExpressions: Array<{
    compId: number;
    comp: string;
    layerIndex: number;
    layer: string;
    path: string;
    matchName: string;
    expression: string;
    error: string;
    enabled: boolean;
  }>;
  cancelled: boolean;
  hardErrors: number;
}

interface Props {
  runner: CommandRunner;
}

function Chip({ label, count }: { label: string; count: number }) {
  return (
    <span className={count > 0 ? "op-chip op-chip-bad" : "op-chip"}>
      {label}: {count}
    </span>
  );
}

export default function AssetDoctor({ runner }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TaskProgressPayload | null>(null);
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return runner.onProgress((p) => setProgress(p));
  }, [runner]);

  async function scan(): Promise<void> {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const outcome = await runner.run("assets.doctorScan", {}, { chunkSize: 50 });
      if (outcome.result.ok) {
        setReport(outcome.result.data as DoctorReport);
      } else {
        setError((outcome.result.errors ?? []).map((e) => e.message).join("; ") || "Scan failed");
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const clean =
    report !== null &&
    report.counts.missing === 0 &&
    report.counts.unused === 0 &&
    report.counts.brokenExpressions === 0;

  return (
    <section className="op-doctor">
      <div className="op-doctor-head">
        <h3>Asset Doctor</h3>
        <button className="op-run" disabled={busy} onClick={scan}>
          {busy ? "Scanning…" : report ? "Re-scan" : "Scan project"}
        </button>
      </div>
      {busy && progress && (
        <div className="op-progress">
          <div className="op-progress-track">
            <div
              className="op-progress-fill"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="op-dim">{progress.message ?? `${progress.done}/${progress.total}`}</span>
        </div>
      )}
      {error && <div className="op-error">{error}</div>}
      {!report && !busy && (
        <p className="op-dim">
          One-click audit: missing media, unused footage, broken expressions (docs/03 §1).
        </p>
      )}
      {report && (
        <>
          <div className="op-chips">
            <Chip label="Missing" count={report.counts.missing} />
            <Chip label="Unused" count={report.counts.unused} />
            <Chip label="Broken expressions" count={report.counts.brokenExpressions} />
          </div>
          {clean && <p className="op-doctor-clean">Project clean — no findings.</p>}
          {report.counts.missing > 0 && (
            <div className="op-doctor-section">
              <h3>Missing media ({report.counts.missing})</h3>
              <ul className="op-findings">
                {report.missing.map((f) => (
                  <li key={f.itemId} className="op-finding">
                    <span className="op-finding-title">{f.name}</span>
                    <span className="op-finding-meta">
                      {f.path || "(no path)"} · {f.reason}
                      {f.folder ? ` · in ${f.folder}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.counts.unused > 0 && (
            <div className="op-doctor-section">
              <h3>Unused footage ({report.counts.unused})</h3>
              <ul className="op-findings">
                {report.unused.map((f) => (
                  <li key={f.itemId} className="op-finding">
                    <span className="op-finding-title">{f.name}</span>
                    <span className="op-finding-meta">
                      {f.kind}
                      {f.folder ? ` · in ${f.folder}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.counts.brokenExpressions > 0 && (
            <div className="op-doctor-section">
              <h3>Broken expressions ({report.counts.brokenExpressions})</h3>
              <ul className="op-findings">
                {report.brokenExpressions.map((f, i) => (
                  <li key={`${f.compId}-${f.layerIndex}-${f.matchName}-${i}`} className="op-finding">
                    <span className="op-finding-title">
                      {f.comp} · {f.layer} · {f.path}
                      {f.enabled ? "" : " (disabled)"}
                    </span>
                    <span className="op-finding-meta">
                      {f.error} — <code>{f.expression}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="op-dim">
            Scanned {report.scanned.items} items · {report.scanned.comps} comps ·{" "}
            {report.scanned.layers} layers · {report.scanned.expressions} expressions
            {report.cancelled ? " · scan cancelled" : ""}
            {report.hardErrors > 0 ? ` · ${report.hardErrors} unreadable nodes` : ""}
          </p>
        </>
      )}
    </section>
  );
}
