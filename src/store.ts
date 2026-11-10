import * as vscode from 'vscode';
import { scanFile } from './scanner';
import { Task } from './types';

export class TaskStore implements vscode.Disposable {
  private readonly byFile = new Map<string, Task[]>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly log: vscode.OutputChannel) {}

  get all(): Task[] {
    const result: Task[] = [];
    for (const tasks of this.byFile.values()) {
      result.push(...tasks);
    }
    return result;
  }

  private get excludedFolders(): string[] {
    return vscode.workspace.getConfiguration('tasktracker').get<string[]>('excludedFolders', []);
  }

  private get maxFileSizeKb(): number {
    return vscode.workspace.getConfiguration('tasktracker').get<number>('maxFileSizeKb', 1024);
  }

  /** Файл входит в рабочее пространство и не лежит в служебном каталоге. */
  isScannable(uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) {
      return false;
    }
    const excluded = new Set(this.excludedFolders);
    const rel = vscode.workspace.asRelativePath(uri, false);
    const dirs = rel.split(/[\\/]/).slice(0, -1);
    return !dirs.some((d) => excluded.has(d));
  }

  async scanWorkspace(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      this.byFile.clear();
      this.emitter.fire();
      return;
    }
    await vscode.window.withProgress(
      { location: { viewId: 'tasktracker.tasks' }, title: 'TaskTracker: сканирование…' },
      async () => {
        const folders = this.excludedFolders;
        const exclude = folders.length > 0 ? `**/{${folders.join(',')}}/**` : undefined;
        const files = await vscode.workspace.findFiles('**/*', exclude);

        this.byFile.clear();
        const batchSize = 20;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const results = await Promise.all(batch.map((f) => scanFile(f, this.maxFileSizeKb)));
          results.forEach((r, idx) => {
            if (r.error) {
              this.log.appendLine(`[ошибка чтения] ${r.error}`);
            }
            if (r.tasks.length > 0) {
              this.byFile.set(batch[idx].toString(), r.tasks);
            }
          });
        }
        this.emitter.fire();
      }
    );
  }

  async updateFile(uri: vscode.Uri): Promise<void> {
    if (!this.isScannable(uri)) {
      return;
    }
    const result = await scanFile(uri, this.maxFileSizeKb);
    if (result.error) {
      this.log.appendLine(`[ошибка чтения] ${result.error}`);
    }
    const key = uri.toString();
    const had = this.byFile.has(key);
    if (result.tasks.length > 0) {
      this.byFile.set(key, result.tasks);
      this.emitter.fire();
    } else if (had) {
      this.byFile.delete(key);
      this.emitter.fire();
    }
  }

  removeFile(uri: vscode.Uri): void {
    if (this.byFile.delete(uri.toString())) {
      this.emitter.fire();
    }
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
