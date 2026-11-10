import * as vscode from 'vscode';
import { isExcluded } from './exclusions';
import { scanFile } from './scanner';
import { Task } from './types';

export class TaskStore implements vscode.Disposable {
  private readonly byFile = new Map<string, Task[]>();
  /** Fires with the URIs of the files whose task lists have changed. */
  private readonly emitter = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly log: vscode.OutputChannel) {}

  get all(): Task[] {
    const result: Task[] = [];
    for (const tasks of this.byFile.values()) {
      result.push(...tasks);
    }
    return result;
  }

  tasksFor(uri: vscode.Uri): Task[] {
    return this.byFile.get(uri.toString()) ?? [];
  }

  private get excludedFolders(): string[] {
    return vscode.workspace.getConfiguration('tasktracker').get<string[]>('excludedFolders', []);
  }

  private get maxFileSizeKb(): number {
    return vscode.workspace.getConfiguration('tasktracker').get<number>('maxFileSizeKb', 1024);
  }

  /** The file belongs to the workspace and is not excluded by folder or file patterns. */
  isScannable(uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) {
      return false;
    }
    return !isExcluded(uri);
  }

  async scanWorkspace(): Promise<void> {
    const previous = [...this.byFile.keys()];

    if (!vscode.workspace.workspaceFolders) {
      this.byFile.clear();
      this.emitter.fire(previous.map((k) => vscode.Uri.parse(k)));
      return;
    }
    await vscode.window.withProgress(
      { location: { viewId: 'tasktracker.tasks' }, title: 'TaskTracker: сканирование…' },
      async () => {
        const folders = this.excludedFolders;
        const exclude = folders.length > 0 ? `**/{${folders.join(',')}}/**` : undefined;
        const found = await vscode.workspace.findFiles('**/*', exclude);
        const files = found.filter((f) => !isExcluded(f));

        this.byFile.clear();
        let errors = 0;
        let binary = 0;
        let tooLarge = 0;
        const batchSize = 20;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const results = await Promise.all(batch.map((f) => scanFile(f, this.maxFileSizeKb)));
          results.forEach((r, idx) => {
            if (r.error) {
              errors++;
              this.log.appendLine(`[read error] ${r.error}`);
            }
            if (r.skipped === 'binary') {
              binary++;
            } else if (r.skipped === 'size') {
              tooLarge++;
            }
            if (r.tasks.length > 0) {
              this.byFile.set(batch[idx].toString(), r.tasks);
            }
          });
        }
        this.log.appendLine(
          `[scan] files found: ${files.length}, files with tasks: ${this.byFile.size}, ` +
            `skipped as binary: ${binary}, too large: ${tooLarge}, read errors: ${errors}`
        );
        const keys = new Set<string>([...previous, ...this.byFile.keys()]);
        this.emitter.fire([...keys].map((k) => vscode.Uri.parse(k)));
      }
    );
  }

  async updateFile(uri: vscode.Uri): Promise<void> {
    if (!this.isScannable(uri)) {
      return;
    }
    const result = await scanFile(uri, this.maxFileSizeKb);
    if (result.error) {
      this.log.appendLine(`[read error] ${result.error}`);
    }
    const key = uri.toString();
    const had = this.byFile.has(key);
    if (result.tasks.length > 0) {
      this.byFile.set(key, result.tasks);
      this.emitter.fire([uri]);
    } else if (had) {
      this.byFile.delete(key);
      this.emitter.fire([uri]);
    }
  }

  removeFile(uri: vscode.Uri): void {
    if (this.byFile.delete(uri.toString())) {
      this.emitter.fire([uri]);
    }
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
