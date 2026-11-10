import * as vscode from 'vscode';
import { Task, TaskType } from './types';

/**
 * Keywords: upper-case anywhere, or lower/title-case only when followed
 * by a colon, to avoid matching ordinary words.
 */
const KEYWORDS = 'TODO|FIXME|BUG|HACK|(?:todo|fixme|bug|hack|Todo|Fixme|Bug|Hack)(?=[ \\t]*:)';

/** Keyword, optional "(author)", optional colon, then the task text. */
const TAIL = `\\b(${KEYWORDS})\\b[ \\t]*(?:\\([^)]*\\))?[ \\t]*:?[ \\t]*(.*)$`;

// All patterns share the same groups: 1 = marker, 2 = text before keyword, 3 = keyword, 4 = task text.

/** Source code and config files: a comment marker must precede the keyword. */
const GENERIC_RE = new RegExp(`(\\/\\/|\\/\\*+|<!--|#|--|;|%|\\*)(.*?)${TAIL}`);

/**
 * Typst (.typ): only "//" and "/* ... *\/" comments are recognised. A leading "*" followed by whitespace is
 * accepted for continuation lines of block comments. Markup such as "#" or "*bold*" is not a comment.
 */
const TYPST_RE = new RegExp(`(\\/\\/|\\/\\*+|^\\s*\\*(?=\\s|$))(.*?)${TAIL}`);

/** Plain text files have no comment syntax, so the keyword is accepted anywhere in a line. */
const PLAIN_RE = new RegExp(`(^)(.*?)${TAIL}`);

const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'rst', 'log', 'adoc', 'org']);

const MAX_LINE_LENGTH = 2000;

function extensionOf(uri: vscode.Uri): string {
  const base = uri.path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function patternFor(uri: vscode.Uri): RegExp {
  const ext = extensionOf(uri);
  if (ext === 'typ') {
    return TYPST_RE;
  }
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    return PLAIN_RE;
  }
  return GENERIC_RE;
}

export function parseText(text: string, uri: vscode.Uri, relativePath: string): Task[] {
  const re = patternFor(uri);
  const tasks: Task[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_LENGTH) {
      continue; // likely a minified file
    }
    const m = re.exec(line);
    if (!m) {
      continue;
    }
    const body = m[4].replace(/\s*(\*\/|-->)\s*$/, '').trim();
    tasks.push({
      type: m[3].toUpperCase() as TaskType,
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
  skipped?: 'size' | 'binary';
}

/** Decodes file bytes; returns undefined for binary data. Handles UTF-16 files with a BOM. */
function decode(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  if (bytes.subarray(0, 8000).includes(0)) {
    return undefined;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** Reads a file (or takes the text of an open document) and looks for tasks in it. */
export async function scanFile(uri: vscode.Uri, maxFileSizeKb: number): Promise<ScanResult> {
  const relativePath = vscode.workspace.asRelativePath(uri, true);
  try {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) {
      return { tasks: parseText(open.getText(), uri, relativePath) };
    }

    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > maxFileSizeKb * 1024) {
      return { tasks: [], skipped: 'size' };
    }
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = decode(bytes);
    if (text === undefined) {
      return { tasks: [], skipped: 'binary' };
    }
    return { tasks: parseText(text, uri, relativePath) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { tasks: [], error: `${relativePath}: ${message}` };
  }
}
