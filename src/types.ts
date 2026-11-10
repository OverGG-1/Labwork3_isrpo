/**
 * Общие типы данных TaskTracker.
 *
 * Модуль задаёт допустимые категории задач, порядок их приоритета,
 * режимы сортировки и структуру записи, передаваемой между компонентами.
 */

import * as vscode from 'vscode';

/** Категория найденной задачи. */
export type TaskType = 'TODO' | 'FIXME' | 'BUG' | 'HACK';

/** Полный перечень категорий, доступных в интерфейсе фильтрации. */
export const ALL_TYPES: TaskType[] = ['BUG', 'FIXME', 'HACK', 'TODO'];

/** Type order used when sorting by type (most urgent first). */
/** Числовой приоритет категорий: меньшее значение означает более высокий приоритет. */
export const TYPE_ORDER: Record<TaskType, number> = { BUG: 0, FIXME: 1, HACK: 2, TODO: 3 };

/** Поле, по которому пользователь может упорядочить список задач. */
export type SortMode = 'file' | 'type' | 'line';

/**
 * Найденная в проекте задача.
 * @property type Тип маркера TODO/FIXME/BUG/HACK.
 * @property text Текст после маркера.
 * @property uri URI исходного файла.
 * @property relativePath Путь относительно рабочего пространства.
 * @property line Номер строки, начиная с единицы.
 */
export interface Task {
  type: TaskType;
  text: string;
  uri: vscode.Uri;
  relativePath: string;
  /** 1-based line number. */
  line: number;
}
