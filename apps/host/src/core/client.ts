import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface Envelope {
  schemaVersion: number;
  messageId: string;
  runId: string;
  kind: string;
  payload: Record<string, unknown>;
}
export interface CoreEvent extends Envelope {
  kind: 'event';
  payload: { status: 'running' | 'completed' | 'cancelled' | 'error'; code?: string; data?: unknown };
}
interface Pending {
  runId: string;
  events: CoreEvent[];
  resolve: (events: CoreEvent[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
const MAX_REQUEST_BYTES = 1024 * 1024;
// JSON escaping can expand one input byte to six; allow envelope overhead too.
const MAX_EVENT_BYTES = 8 * 1024 * 1024;
export interface CoreOptions {
  executable: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/** One owned core process. stdout is exclusively bounded UTF-8 JSONL. */
export class CoreClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, Pending>();
  private readonly timeoutMs: number;
  private closed = false;
  private buffer = '';
  private stderr = '';
  private readonly exited: Promise<void>;

  constructor(options: CoreOptions) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Invalid timeout');
    this.child = spawn(options.executable, options.args ?? [], { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: 'pipe' });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.receive(chunk));
    this.child.stderr.on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-16384); });
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.exited = new Promise(resolve => this.child.once('close', (code, signal) => {
      this.fail(new Error(`Core exited (${code ?? signal}); pending request incomplete`));
      resolve();
    }));
  }

  get diagnostics(): string { return this.stderr; }

  send(message: Envelope): Promise<CoreEvent[]> {
    if (this.closed) return Promise.reject(new Error('Core client closed'));
    if (!message.messageId || !message.runId || this.pending.has(message.messageId)) return Promise.reject(new Error('Invalid or duplicate messageId/runId'));
    let line: string;
    try { line = JSON.stringify(message) + '\n'; } catch { return Promise.reject(new Error('Message is not JSON serializable')); }
    if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) return Promise.reject(new Error('Protocol message exceeds 1 MiB'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Core request timeout')), this.timeoutMs);
      this.pending.set(message.messageId, { runId: message.runId, events: [], resolve, reject, timer });
      this.child.stdin.write(line, 'utf8', error => { if (error) this.fail(error); });
    });
  }

  private receive(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    let boundary: number;
    while ((boundary = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);
      if (Buffer.byteLength(line) > MAX_EVENT_BYTES) { this.fail(new Error('Protocol output frame exceeds 8 MiB')); return; }
      try {
        const event = JSON.parse(line) as CoreEvent;
        if (!event || event.schemaVersion !== 1 || event.kind !== 'event' || !event.payload || !['running', 'completed', 'cancelled', 'error'].includes(event.payload.status)) throw new Error('Invalid event');
        const pending = this.pending.get(event.messageId);
        if (!pending || pending.runId !== event.runId) throw new Error('Uncorrelated event');
        pending.events.push(event);
        if (event.payload.status !== 'running') {
          clearTimeout(pending.timer);
          this.pending.delete(event.messageId);
          pending.resolve(pending.events);
        }
      } catch { this.fail(new Error('Core protocol error on stdout')); return; }
    }
    if (Buffer.byteLength(this.buffer) > MAX_EVENT_BYTES) this.fail(new Error('Protocol output frame exceeds 8 MiB'));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.child.kill();
  }

  async close(): Promise<void> {
    this.fail(new Error('Core client closed'));
    await this.exited;
  }
}
