/**
 * Подсветка задач в открытых редакторах.
 *
 * Для строк с пометками устанавливает значок в gutter,
 * фоновую подсветку и маркер в overview ruler. Анализирует только видимые
 * документы и ограничивает размер документа по числу строк.
 */

import * as vscode from 'vscode';
import { isExcluded } from './exclusions';
import { parseText } from './scanner';
import { ALL_TYPES, TaskType } from './types';

const MAX_LINES = 20000;

/**
 * Marks lines that contain tasks: a coloured icon in the gutter next to the line number,
 * a soft background on the whole line and a mark in the overview ruler.
 * (The VS Code API does not allow recolouring the line number text itself.)
 */
/** Управляет наборами декораций редактора для всех поддерживаемых типов задач. */
export class EditorHighlighter implements vscode.Disposable {
  private readonly types = new Map<TaskType, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer?: NodeJS.Timeout;

  constructor(context: vscode.ExtensionContext) {
    for (const type of ALL_TYPES) {
      const name = type.toLowerCase();
      this.types.set(
        type,
        vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          backgroundColor: new vscode.ThemeColor(`tasktracker.${name}Background`),
          gutterIconPath: context.asAbsolutePath(`resources/gutter-${name}.svg`),
          gutterIconSize: 'contain',
          overviewRulerColor: new vscode.ThemeColor(`tasktracker.${name}Foreground`),
          overviewRulerLane: vscode.OverviewRulerLane.Right,
        })
      );
    }

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
      ...this.types.values()
    );
    this.refreshAll();
  }

  /** Пересчитывает подсветку во всех видимых редакторах. */
refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.update(editor);
    }
  }

  /** Откладывает обновление подсветки, объединяя частые события ввода в один пересчёт. */
private schedule(doc: vscode.TextDocument): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc) {
          this.update(editor);
        }
      }
    }, 200);
  }

  /** Анализирует документ редактора и устанавливает диапазоны подсветки по категориям. */
private update(editor: vscode.TextEditor): void {
    const enabled = vscode.workspace.getConfiguration('tasktracker').get<boolean>('highlightInEditor', true);
    const doc = editor.document;
    const ranges = new Map<TaskType, vscode.Range[]>(ALL_TYPES.map((t) => [t, []]));

    const supported = doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled';
    if (enabled && supported && doc.lineCount <= MAX_LINES && !isExcluded(doc.uri)) {
      for (const task of parseText(doc.getText(), doc.uri, '')) {
        const pos = new vscode.Position(task.line - 1, 0);
        ranges.get(task.type)!.push(new vscode.Range(pos, pos));
      }
    }
    for (const [type, deco] of this.types) {
      editor.setDecorations(deco, ranges.get(type)!);
    }
  }

  /** Останавливает таймер и освобождает обработчики событий и типы декораций. */
dispose(): void {
    clearTimeout(this.timer);
    this.disposables.forEach((d) => d.dispose());
  }
}
