'use strict';

/**
 * "Why is my tab length 2 here and 4 there", answered for one file.
 *
 * Lists the settings that shape a file — editor, whitespace, encoding, line
 * endings, and anything its project root's `.chevron/config.json` sets — with
 * the value in force and the source it came from. A root's settings that are
 * waiting for trust are listed apart, so a value that is not what the
 * repository asked for says why.
 *
 * docs/reference/config-precedence.md
 */

const path = require('path');

/** Namespaces that shape how a file is edited, always shown. */
const FILE_NAMESPACES = ['editor', 'whitespace', 'line-ending-selector'];
const FILE_KEYS = ['core.fileEncoding'];

export interface SettingRow {
  keyPath: string;
  value: unknown;
  source: 'root' | 'user' | 'default';
  scoped: boolean;
  path: string | null;
  withheldBy?: string;
}

export interface SettingsSourceReport {
  filePath: string | null;
  root: string | null;
  rootConfig: string | null;
  trusted: boolean;
  rows: SettingRow[];
  withheld: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Leaf key paths of a settings object; arrays are leaves. */
function leafKeyPaths(settings: unknown, prefix = ''): string[] {
  if (!isPlainObject(settings)) return prefix ? [prefix] : [];
  const keys: string[] = [];
  for (const key of Object.keys(settings)) {
    if (!prefix && key.startsWith('.')) {
      // A selector: its keys are the same settings, scoped.
      keys.push(...leafKeyPaths(settings[key]));
      continue;
    }
    keys.push(...leafKeyPaths(settings[key], prefix ? `${prefix}.${key}` : key));
  }
  return keys;
}

function schemaKeyPaths(config: any, namespace: string): string[] {
  const schema = config.getSchema(namespace);
  if (!schema || !isPlainObject(schema.properties)) return [];
  return leafSchemaPaths(schema, namespace);
}

function leafSchemaPaths(schema: any, prefix: string): string[] {
  if (schema && schema.type === 'object' && isPlainObject(schema.properties)) {
    const keys: string[] = [];
    for (const key of Object.keys(schema.properties)) {
      keys.push(...leafSchemaPaths(schema.properties[key], `${prefix}.${key}`));
    }
    return keys;
  }
  return [prefix];
}

export function collectSettingsSources(
  config: any,
  { filePath, scope }: { filePath: string | null; scope?: unknown }
): SettingsSourceReport {
  const entry = filePath ? config.rootEntryFor(filePath) : null;
  const keyPaths = new Set<string>(FILE_KEYS);
  for (const namespace of FILE_NAMESPACES) {
    for (const keyPath of schemaKeyPaths(config, namespace)) keyPaths.add(keyPath);
  }
  if (entry) {
    for (const keyPath of leafKeyPaths(entry.raw)) keyPaths.add(keyPath);
  }

  const options = { root: filePath || undefined, scope };
  const withheld: string[] = entry ? entry.withheld.slice() : [];
  const rows: SettingRow[] = [];
  for (const keyPath of [...keyPaths].sort()) {
    const source = config.getSourceOf(keyPath, options);
    rows.push({
      keyPath,
      value: config.get(keyPath, options),
      source: source.source,
      scoped: source.scoped,
      path: source.path,
      withheldBy: source.withheldBy
    });
  }

  return {
    filePath,
    root: entry ? entry.root : null,
    rootConfig: entry ? entry.source : null,
    trusted: entry ? config.isRootTrusted(entry.root) : false,
    rows,
    withheld
  };
}

function formatValue(value: unknown): string {
  if (value === undefined) return '-';
  const text = JSON.stringify(value);
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

function formatSource(row: SettingRow): string {
  const scoped = row.scoped ? ', for this language' : '';
  if (row.source === 'root') return `project${scoped}`;
  if (row.source === 'user') return `your config${scoped}`;
  return 'default';
}

export function formatSettingsSources(report: SettingsSourceReport): string {
  const lines: string[] = [];
  lines.push('# Where these settings come from');
  lines.push('');
  lines.push(report.filePath ? `File: ${report.filePath}` : 'File: (not saved)');
  if (report.rootConfig) {
    lines.push(`Project config: ${report.rootConfig}`);
    lines.push(`Project trusted: ${report.trusted ? 'yes' : 'no'}`);
  } else if (report.root) {
    lines.push(`Project: ${report.root} (no ${path.join('.chevron', 'config.json')})`);
  } else {
    lines.push('Project config: none');
  }
  lines.push('');
  lines.push('A project setting beats yours, and yours beats the default.');
  lines.push('See docs/reference/config-precedence.md.');
  lines.push('');

  const nonDefault = report.rows.filter(row => row.source !== 'default');
  const defaults = report.rows.filter(row => row.source === 'default');
  const table = (rows: SettingRow[]) => {
    lines.push('| Setting | Value | From |');
    lines.push('|---|---|---|');
    for (const row of rows) {
      const note = row.withheldBy ? ' (project value waiting for trust)' : '';
      lines.push(
        `| \`${row.keyPath}\` | \`${formatValue(row.value)}\` | ${formatSource(row)}${note} |`
      );
    }
    lines.push('');
  };

  lines.push('## Set by the project or by you');
  lines.push('');
  if (nonDefault.length > 0) table(nonDefault);
  else lines.push('Nothing: every setting below is the default.', '');

  if (report.withheld.length > 0) {
    lines.push('## Waiting for trust');
    lines.push('');
    lines.push(
      'The project config sets these, but they only apply in a trusted project.'
    );
    lines.push(
      'Run **Chevron Lsp: Trust Project** with this file active to apply them.'
    );
    lines.push('');
    for (const keyPath of report.withheld) lines.push(`- \`${keyPath}\``);
    lines.push('');
  }

  lines.push('## Defaults');
  lines.push('');
  table(defaults);
  return lines.join('\n');
}

module.exports = { collectSettingsSources, formatSettingsSources };
