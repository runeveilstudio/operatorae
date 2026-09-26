/** Operation audit log (docs/01 principle 8) — append-only, local, no project content. */
export interface AuditEntry {
  ts: number;
  commandId: string;
  taskId: string;
  ok: boolean;
  durationMs?: number;
  undoToken?: string | null;
  snapshotId?: string | null;
  snapshotFailed?: boolean;
  dryRun?: boolean;
  errorCodes?: string[];
}

export interface AuditSink {
  append(entry: AuditEntry): void;
}

export class InMemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  append(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}

export class CallbackAuditSink implements AuditSink {
  constructor(private readonly appendFn: (entry: AuditEntry) => void) {}
  append(entry: AuditEntry): void {
    this.appendFn(entry);
  }
}
