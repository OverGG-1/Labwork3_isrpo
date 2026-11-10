import * as vscode from 'vscode';
import { Task, TaskType } from './types';

/**
 * Маркер комментария, затем любой текст, затем ключевое слово (в верхнем регистре),
 * необязательный автор в скобках, необязательное двоеточие и текст задачи.
 * Полноценный разбор языков не выполняется (см. раздел 5 ТЗ).
 */
const COMMENT_RE =
  /(\/\/|\/\*+|<!--|#|--|;|%|\*)(.*?)\b(TODO|FIXME|BUG|HACK)\b[ \t]*(?:\([^)]*\))?[ \t]*:?[ \t]*(.*)$/;

const MAX_LINE_LENGTH = 2000;

export function parseText(text: string, uri: vscode.Uri, relativePath: string): Task[] {
  const tasks: Task[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_LENGTH) {
      continue; // вероятно, минифицированный файл
    }
    const m = COMMENT_RE.exec(line);
    if (!m) {
      continue;
    }
    const body = m[4].replace(/\s*(\*\/|-->)\s*$/, '').trim();
    tasks.push({
      type: m[3] as TaskType,
      text: body.length > 0 ? body : '(без описания)',
      uri,
      relativePath,
      line: i + 1,
    });
  }
  return tasks;
}

export interface ScanResult {
  tasks: Task[];
  error?: string;
}

/** Читает файл (или берёт текст из открытого документа) и ищет в нём задачи. */
export async function scanFile(uri: vscode.Uri, maxFileSizeKb: number): Promise<ScanResult> {
  const relativePath = vscode.workspace.asRelativePath(uri, true);
  try {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) {
      return { tasks: parseText(open.getText(), uri, relativePath) };
    }

    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > maxFileSizeKb * 1024) {
      return { tasks: [] };
    }
    const bytes = await vscode.workspace.fs.readFile(uri);
    const head = bytes.subarray(0, 8000);
    if (head.includes(0)) {
      return { tasks: [] }; // бинарный файл
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    return { tasks: parseText(text, uri, relativePath) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { tasks: [], error: `${relativePath}: ${message}` };
  }
}
