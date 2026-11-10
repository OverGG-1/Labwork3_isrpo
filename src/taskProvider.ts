import * as vscode from 'vscode';
import { TaskStore } from './store';
import { ALL_TYPES, SortMode, Task, TaskType, TYPE_ORDER } from './types';

const ICONS: Record<TaskType, { icon: string; color: string }> = {
  BUG: { icon: 'bug', color: 'charts.red' },
  FIXME: { icon: 'wrench', color: 'charts.orange' },
  HACK: { icon: 'warning', color: 'charts.yellow' },
  TODO: { icon: 'checklist', color: 'charts.blue' },
};

const SORT_LABELS: Record<SortMode, string> = {
  file: 'имени файла',
  type: 'типу',
  line: 'номеру строки',
};

export class TaskProvider implements vscode.TreeDataProvider<Task> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private filterTypes = new Set<TaskType>(ALL_TYPES);
  private query = '';
  private sortMode: SortMode = 'file';
  private view?: vscode.TreeView<Task>;

  constructor(private readonly store: TaskStore) {
    store.onDidChange(() => this.refresh());
  }

  attach(view: vscode.TreeView<Task>): void {
    this.view = view;
    this.updateHeader(this.visibleTasks().length);
  }

  get activeTypes(): ReadonlySet<TaskType> {
    return this.filterTypes;
  }

  get currentSort(): SortMode {
    return this.sortMode;
  }

  get currentQuery(): string {
    return this.query;
  }

  setTypes(types: TaskType[]): void {
    this.filterTypes = new Set(types);
    this.refresh();
  }

  setQuery(query: string): void {
    this.query = query.trim();
    this.refresh();
  }

  setSort(mode: SortMode): void {
    this.sortMode = mode;
    this.refresh();
  }

  clearFilters(): void {
    this.filterTypes = new Set(ALL_TYPES);
    this.query = '';
    this.refresh();
  }

  refresh(): void {
    this.emitter.fire();
    this.updateHeader(this.visibleTasks().length);
  }

  private updateHeader(shown: number): void {
    if (!this.view) {
      return;
    }
    const total = this.store.all.length;
    this.view.description = shown === total ? `${total}` : `${shown} из ${total}`;

    const parts: string[] = [];
    if (this.filterTypes.size < ALL_TYPES.length) {
      parts.push(`типы: ${[...this.filterTypes].join(', ') || 'нет'}`);
    }
    if (this.query) {
      parts.push(`поиск: «${this.query}»`);
    }
    parts.push(`сортировка по ${SORT_LABELS[this.sortMode]}`);
    this.view.message = total === 0 ? 'Задачи не найдены.' : parts.join(' · ');
  }

  private visibleTasks(): Task[] {
    const q = this.query.toLowerCase();
    const tasks = this.store.all.filter(
      (t) =>
        this.filterTypes.has(t.type) &&
        (q === '' || t.text.toLowerCase().includes(q) || t.relativePath.toLowerCase().includes(q))
    );
    return tasks.sort(this.comparator());
  }

  private comparator(): (a: Task, b: Task) => number {
    const byFile = (a: Task, b: Task) => a.relativePath.localeCompare(b.relativePath);
    const byType = (a: Task, b: Task) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    const byLine = (a: Task, b: Task) => a.line - b.line;
    const chain = (...fns: Array<(a: Task, b: Task) => number>) => (a: Task, b: Task) => {
      for (const f of fns) {
        const r = f(a, b);
        if (r !== 0) {
          return r;
        }
      }
      return 0;
    };
    switch (this.sortMode) {
      case 'type':
        return chain(byType, byFile, byLine);
      case 'line':
        return chain(byLine, byFile, byType);
      default:
        return chain(byFile, byLine, byType);
    }
  }

  getChildren(element?: Task): Task[] {
    return element ? [] : this.visibleTasks();
  }

  getTreeItem(task: Task): vscode.TreeItem {
    const item = new vscode.TreeItem(`${task.type}: ${task.text}`, vscode.TreeItemCollapsibleState.None);
    item.id = `${task.uri.toString()}#${task.line}#${task.type}`;
    item.description = `${task.relativePath}:${task.line}`;
    item.tooltip = new vscode.MarkdownString(
      `**${task.type}** — ${escapeMd(task.text)}\n\n\`${task.relativePath}:${task.line}\``
    );
    const { icon, color } = ICONS[task.type];
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    item.command = { command: 'tasktracker.openTask', title: 'Перейти к задаче', arguments: [task] };
    item.contextValue = 'task';
    return item;
  }
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}\[\]()#+\-.!<>|]/g, '\\$&');
}
