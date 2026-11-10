/**
 * Checks file and directory exclusion rules.
 *
 * Supports basic glob patterns (*, ** and ?) and caches compiled
 * regular expressions to avoid recompiling them for every file.
 */

import * as vscode from 'vscode';

const cache = new Map<string, RegExp>();

/** Converts a supported glob pattern into a case-insensitive regular expression and caches the result. */
function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) {
    return cached;
  }
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'; // "**/" matches any number of directories, including none
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const compiled = new RegExp(`^${re}$`, 'i');
  cache.set(glob, compiled);
  return compiled;
}

/**
 * True when the file must be ignored: it lies inside an excluded folder
 * (tasktracker.excludedFolders), is named like one of those entries, or matches an excluded
 * file pattern (tasktracker.excludedFiles).
 * Files outside the workspace are never excluded by this check.
 */
/** Returns true when a file must be excluded from scanning according to user settings. */
export function isExcluded(uri: vscode.Uri): boolean {
  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    return false;
  }
  const config = vscode.workspace.getConfiguration('tasktracker');
  const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');

  const base = rel.split('/').pop() ?? rel;
  const folders = new Set(config.get<string[]>('excludedFolders', []).map((f) => f.trim()));
  const dirs = rel.split('/').slice(0, -1);
  if (dirs.some((d) => folders.has(d))) {
    return true;
  }
  // Lenient: a bare file name listed among the folders (e.g. "README.md") is ignored as well.
  if (folders.has(base)) {
    return true;
  }

  const patterns = config.get<string[]>('excludedFiles', []);
  return patterns.some((raw) => {
    const pattern = raw.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
    if (pattern === '') {
      return false;
    }
    const re = globToRegExp(pattern);
    // A pattern without a slash (e.g. "README.md" or "*.md") matches the file name at any depth.
    return re.test(rel) || (!pattern.includes('/') && re.test(base));
  });
}
