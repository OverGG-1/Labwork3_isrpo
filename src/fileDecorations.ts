/**
 * Декоратор файлов для представления Explorer.
 *
 * Показывает количество обнаруженных задач и окрашивает файл по наиболее
 * приоритетному типу задачи. Обновляет декорации при изменении хранилища.
 */

import * as vscode from 'vscode';
import { TaskStore } from './store';
import { TaskType, TYPE_ORDER } from './types';

export const COLOR_IDS: Record<TaskType, string> = {
  BUG: 'tasktracker.bugForeground',
  FIXME: 'tasktracker.fixmeForeground',
  HACK: 'tasktracker.hackForeground',
  TODO: 'tasktracker.todoForeground',
};

/** Adds a badge and a colour to files that contain tasks in the Explorer. */
/** Реализует FileDecorationProvider и отражает наличие задач на значках файлов. */
export class TaskFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly sub: vscode.Disposable;

  constructor(private readonly store: TaskStore) {
    this.sub = store.onDidChange((uris) => this.emitter.fire(uris));
  }

  /** Просит VS Code повторно вычислить декорации всех файлов. */
refreshAll(): void {
    this.emitter.fire(undefined);
  }

  /** Формирует бейдж, подсказку и цвет для файла на основе его задач. */
provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const enabled = vscode.workspace.getConfiguration('tasktracker').get<boolean>('decorateExplorer', true);
    if (!enabled) {
      return undefined;
    }
    const tasks = this.store.tasksFor(uri);
    if (tasks.length === 0) {
      return undefined;
    }

    // The colour follows the most urgent task type in the file.
    const counts = new Map<TaskType, number>();
    for (const t of tasks) {
      counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    }
    const top = [...counts.keys()].sort((a, b) => TYPE_ORDER[a] - TYPE_ORDER[b])[0];
    const summary = [...counts.entries()]
      .sort((a, b) => TYPE_ORDER[a[0]] - TYPE_ORDER[b[0]])
      .map(([type, n]) => `${type}: ${n}`)
      .join(', ');

    return new vscode.FileDecoration(
      tasks.length > 9 ? '9+' : String(tasks.length), // badges are limited to two characters
      `Задач: ${tasks.length} (${summary})`,
      new vscode.ThemeColor(COLOR_IDS[top])
    );
  }

  /** Отключает подписку на хранилище и освобождает EventEmitter. */
dispose(): void {
    this.sub.dispose();
    this.emitter.dispose();
  }
}
