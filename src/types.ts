import * as vscode from 'vscode';

export type TaskType = 'TODO' | 'FIXME' | 'BUG' | 'HACK';

export const ALL_TYPES: TaskType[] = ['BUG', 'FIXME', 'HACK', 'TODO'];

export const TYPE_ORDER: Record<TaskType, number> = { BUG: 0, FIXME: 1, HACK: 2, TODO: 3 };

export type SortMode = 'file' | 'type' | 'line';

export interface Task {
  type: TaskType;
  text: string;
  uri: vscode.Uri;
  relativePath: string;
  line: number;
}
