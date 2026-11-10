import * as vscode from 'vscode';
import { TaskStore } from './store';
import { TaskProvider } from './taskProvider';
import { ALL_TYPES, SortMode, Task, TaskType } from './types';
import { TaskFileDecorationProvider } from './fileDecorations';
import { EditorHighlighter } from './editorHighlight';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('TaskTracker');
  const store = new TaskStore(log);
  const provider = new TaskProvider(store);

  const view = vscode.window.createTreeView<Task>('tasktracker.tasks', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  provider.attach(view);

  const fileDecorations = new TaskFileDecorationProvider(store);
  const highlighter = new EditorHighlighter(context);

  // --- Commands --------------------------------------------------------
  context.subscriptions.push(
    log,
    store,
    view,
    fileDecorations,
    highlighter,
    vscode.window.registerFileDecorationProvider(fileDecorations),

    vscode.commands.registerCommand('tasktracker.refresh', () => store.scanWorkspace()),

    vscode.commands.registerCommand('tasktracker.openTask', async (task: Task) => {
      try {
        const doc = await vscode.workspace.openTextDocument(task.uri);
        const editor = await vscode.window.showTextDocument(doc);
        const line = Math.min(Math.max(task.line - 1, 0), doc.lineCount - 1);
        const range = doc.lineAt(line).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`TaskTracker: не удалось открыть файл — ${msg}`);
      }
    }),

    vscode.commands.registerCommand('tasktracker.filterByType', async () => {
      const items = ALL_TYPES.map((t) => ({
        label: t,
        picked: provider.activeTypes.has(t),
      }));
      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: 'Показывать задачи типов',
        placeHolder: 'Отметьте нужные типы',
      });
      if (picked) {
        provider.setTypes(picked.map((p) => p.label as TaskType));
      }
    }),

    vscode.commands.registerCommand('tasktracker.sortBy', async () => {
      const options: Array<{ label: string; mode: SortMode }> = [
        { label: 'По имени файла', mode: 'file' },
        { label: 'По типу', mode: 'type' },
        { label: 'По номеру строки', mode: 'line' },
      ];
      const picked = await vscode.window.showQuickPick(
        options.map((o) => ({ ...o, description: o.mode === provider.currentSort ? '(текущая)' : '' })),
        { title: 'Сортировка задач' }
      );
      if (picked) {
        provider.setSort(picked.mode);
      }
    }),

    vscode.commands.registerCommand('tasktracker.search', async () => {
      const value = await vscode.window.showInputBox({
        title: 'Поиск задач',
        prompt: 'Введите текст для поиска (пустая строка — сбросить поиск)',
        value: provider.currentQuery,
      });
      if (value !== undefined) {
        provider.setQuery(value);
      }
    }),

    vscode.commands.registerCommand('tasktracker.clearFilters', () => provider.clearFilters())
  );

  // --- Automatic refresh -----------------------------------------------
  const timers = new Map<string, NodeJS.Timeout>();
  const schedule = (uri: vscode.Uri): void => {
    if (uri.scheme !== 'file') {
      return;
    }
    const key = uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void store.updateFile(uri);
      }, 400)
    );
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(schedule),
    watcher.onDidChange(schedule),
    watcher.onDidDelete((uri) => store.removeFile(uri)),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document.uri)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => store.scanWorkspace()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tasktracker')) {
        highlighter.refreshAll();
        fileDecorations.refreshAll();
        void store.scanWorkspace();
      }
    }),
    { dispose: () => timers.forEach((t) => clearTimeout(t)) }
  );

  void store.scanWorkspace();
}

export function deactivate(): void {}
