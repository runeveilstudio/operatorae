import { useEffect, useState } from "react";
import type { CommandRegistry, CommandRunner, RunOutcome } from "@operator/command-core";
import type { HostInfo } from "@operator/host-adapter";
import type { TaskProgressPayload } from "@operator/protocol";

interface Props {
  runner: CommandRunner;
  registry: CommandRegistry;
  info: HostInfo;
}

export default function OperatorBar({ runner, registry, info }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TaskProgressPayload | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState("selection");
  const [patternMode, setPatternMode] = useState("prefix");
  const [patternText, setPatternText] = useState("shot_");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const results = registry.search(query, 8);
  const selected = selectedId ? registry.get(selectedId) : null;

  useEffect(() => {
    return runner.onProgress((p) => setProgress(p));
  }, [runner]);

  function buildArgs(id: string): Record<string, unknown> {
    if (id === "layers.renameBatch") {
      const pattern =
        patternMode === "replace"
          ? { mode: patternMode, find, replace }
          : { mode: patternMode, text: patternText };
      return { scope, pattern };
    }
    return {};
  }

  async function run(id: string, runDryRun: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setProgress(null);
    try {
      const result = await runner.run(id, buildArgs(id), { dryRun: runDryRun, chunkSize: 2 });
      setOutcome(result);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const resultData = outcome?.result.data ?? null;

  return (
    <section className="op-bar">
      <input
        className="op-input"
        placeholder="Type a command, comp, layer or asset…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length > 0 && !selected) {
            setSelectedId(results[0].def.id);
          }
          if (e.key === "Escape") {
            setSelectedId(null);
            setQuery("");
          }
        }}
      />
      {selected === null ? (
        <ul className="op-list">
          {results.map(({ def }) => (
            <li key={def.id}>
              <button className="op-item" onClick={() => setSelectedId(def.id)}>
                <span className="op-item-title">{def.title}</span>
                <span className="op-item-id">{def.id}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="op-dim">No matching commands</li>}
        </ul>
      ) : (
        <div className="op-detail">
          <div className="op-row">
            <button className="op-back" onClick={() => setSelectedId(null)}>
              ←
            </button>
            <strong>{selected.title}</strong>
          </div>
          {selected.description && <p className="op-dim">{selected.description}</p>}
          {selected.id === "layers.renameBatch" && (
            <div className="op-params">
              <label>
                Scope
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="selection">Selection</option>
                  <option value="comp">Whole comp</option>
                </select>
              </label>
              <label>
                Mode
                <select value={patternMode} onChange={(e) => setPatternMode(e.target.value)}>
                  <option value="prefix">Prefix</option>
                  <option value="suffix">Suffix</option>
                  <option value="replace">Find & replace</option>
                  <option value="number">Number</option>
                </select>
              </label>
              {patternMode === "replace" ? (
                <>
                  <label>
                    Find
                    <input value={find} onChange={(e) => setFind(e.target.value)} />
                  </label>
                  <label>
                    Replace
                    <input value={replace} onChange={(e) => setReplace(e.target.value)} />
                  </label>
                </>
              ) : (
                <label>
                  Text
                  <input value={patternText} onChange={(e) => setPatternText(e.target.value)} />
                </label>
              )}
              <label className="op-check">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (preview only)
              </label>
            </div>
          )}
          <div className="op-row">
            <button className="op-run" disabled={busy} onClick={() => run(selected.id, dryRun)}>
              {dryRun && selected.mutating ? "Preview" : "Run"}
            </button>
            {busy && <span className="op-dim">Running…</span>}
          </div>
          {progress && (
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
          {outcome && (
            <div className={outcome.result.ok ? "op-result" : "op-result op-result-failed"}>
              <div className="op-row">
                <span>
                  {outcome.result.ok ? "OK" : "Failed"} · {outcome.command.id}
                  {outcome.result.durationMs !== undefined ? ` · ${outcome.result.durationMs}ms` : ""}
                </span>
                {outcome.snapshotId && <span className="op-dim">snapshot {outcome.snapshotId}</span>}
              </div>
              {outcome.result.undoToken && (
                <div className="op-dim">
                  One Cmd+Z / Ctrl+Z undoes this batch ({outcome.result.undoToken})
                </div>
              )}
              {outcome.result.errors && outcome.result.errors.length > 0 && (
                <ul className="op-errors">
                  {outcome.result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      [{e.code}] {e.message}
                      {e.target ? ` — ${e.target}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {resultData !== null && <pre className="op-json">{JSON.stringify(resultData, null, 2)}</pre>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
