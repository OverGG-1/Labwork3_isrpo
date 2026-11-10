/**
 * Shared TaskTracker data types.
 *
 * Defines supported task categories, their priority order,
 * sorting modes and the task record shared between components.
 */

import * as vscode from 'vscode';

/** Category of a detected task. */
export type TaskType = 'TODO' | 'FIXME' | 'BUG' | 'HACK';

/** Complete list of categories available in the filtering UI. */
export const ALL_TYPES: TaskType[] = ['BUG', 'FIXME', 'HACK', 'TODO'];

/** Type order used when sorting by type (most urgent first). */
/** Numeric category priority; a lower value means a higher priority. */
export const TYPE_ORDER: Record<TaskType, number> = { BUG: 0, FIXME: 1, HACK: 2, TODO: 3 };

/** Field used to sort the task list. */
export type SortMode = 'file' | 'type' | 'line';

/**
 * A task detected in the project.
 * @property type TODO/FIXME/BUG/HACK marker type.
 * @property text Text following the marker.
 * @property uri URI of the source file.
 * @property relativePath Workspace-relative file path.
 * @property line One-based line number.
 */
export interface Task {
  type: TaskType;
  text: string;
  uri: vscode.Uri;
  relativePath: string;
  /** 1-based line number. */
  line: number;
}
