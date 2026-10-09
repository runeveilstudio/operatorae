import { useState } from "react";
import type { CommandRunner, RunOutcome } from "@operator/command-core";

/**
 * Scripting console (docs/03 §13, docs/05 Phase 1): one snippet in, one
 * result out, full history. Runs through the same command funnel as every
 * other operation — audit log, undo token and all.
 */

interface ConsoleEntry {
  ts: number;
  code: string;
  ok: boolean;
  display: string;
  result: unknown;
  durationMs?: number;
  error?: string;
}

interface Props {
  runner: CommandRunner;
}

function dataOf(outcome: RunOutcome): { display: string; result: unknown } | null {
  const data = outcome.result.data as { display?: string; result?: unknown } | null;
  return data ?? null;
}

export default function Console({ runner }: Props) {
  const [code, setCode] = useState("app.project.activeItem.name");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ConsoleEntry[]>([]);

  async function run(): Promise<void> {
    const snippet = code.trim();
    if (snippet === "") return;
    setBusy(true);
    const ts = Date.now();
    try {
      const outcome = await runner.run("system.eval", { code: snippet });
      const data = dataOf(outcome);
      if (outcome.result.ok && data) {
        setHistory((prev) =>
          [
            {
              ts,
              code: snippet,
              ok: true,
              display: data.display ?? "undefined",
              result: data.result ?? null,
              durationMs: outcome.result.durationMs
            },
            ...prev
          ].slice(0, 50)
        );
      } else {
        setHistory((prev) =>
          [
            {
              ts,
              code: snippet,
              ok: false,
              display: "",
              result: null,
              error: (outcome.result.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join("; ")
            },
            ...prev
          ].slice(0, 50)
        );
      }
    } catch (e) {
      setHistory((prev) =>
        [
          {
            ts,
            code: snippet,
            ok: false,
            display: "",
            result: null,
            error: String((e as Error)?.message ?? e)
          },
          ...prev
        ].slice(0, 50)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="op-console">
      <div className="op-doctor-head">
        <h3>Console</h3>
        <button className="op-run" disabled={busy} onClick={run}>
          {busy ? "Running…" : "Run"}
        </button>
      </div>
      <textarea
        className="op-console-input"
        spellCheck={false}
        rows={2}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void run();
          }
        }}
      />
      <p className="op-dim">Ctrl/Cmd+Enter to run · side effects are wrapped in one undo group</p>
      {history.length > 0 && (
        <ul className="op-console-history">
          {history.map((entry) => (
            <li key={entry.ts} className={entry.ok ? "op-console-entry" : "op-console-entry op-console-error"}>
              <pre className="op-console-code">{entry.code}</pre>
              {entry.ok ? (
                <pre className="op-console-result">
                  {entry.display}
                  {entry.result !== null && entry.result !== "" ? `\n${JSON.stringify(entry.result)}` : ""}
                </pre>
              ) : (
                <pre className="op-console-result op-console-error-text">{entry.error}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
