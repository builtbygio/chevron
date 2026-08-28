// Maintainer script: refresh completions.json from the latest Atom API dump.
// Not loaded at editor runtime.

import * as fs from 'fs';

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

function isVisible({ visibility }: { visibility: string }): boolean {
  return ['Essential', 'Extended', 'Public'].includes(visibility);
}

function getDocLink(className: string, instanceName: string): string {
  return `https://atom.io/docs/api/latest/${className}#instance-${instanceName}`;
}

function convertMethodToSuggestion(className: string, method: any) {
  const { name, summary, returnValues } = method;
  const args = method.arguments;
  const snippets: string[] = [];
  if (args && args.length) {
    for (let i = 0; i < args.length; i++) {
      snippets.push(`\${${i + 1}:${args[i].name}}`);
    }
  }
  const snippet = snippets.length ? `${name}(${snippets.join(', ')})` : null;
  const text = snippets.length ? null : `${name}()`;
  const returnValue = returnValues && returnValues[0] && returnValues[0].type;
  return {
    name,
    text,
    snippet,
    description: summary,
    descriptionMoreURL: getDocLink(className, name),
    leftLabel: returnValue,
    type: 'method'
  };
}

function convertPropertyToSuggestion(
  className: string,
  { name, summary }: { name: string; summary?: string }
) {
  const match = summary && summary.match(/\{(\w+)\}/);
  return {
    name,
    text: name,
    description: summary,
    descriptionMoreURL: getDocLink(className, name),
    leftLabel: match && match[1],
    type: 'property'
  };
}

function textComparator(a: { name: string }, b: { name: string }): number {
  if (a.name > b.name) return 1;
  if (a.name < b.name) return -1;
  return 0;
}

async function main(): Promise<void> {
  const release = await getJson(
    'https://api.github.com/repos/atom/atom/releases/latest',
    { 'User-Agent': 'chevron-autocomplete-chevron-api' }
  );
  const apiAsset = (release.assets || []).find(
    (a: { name: string }) => a.name === 'atom-api.json'
  );
  if (!apiAsset || !apiAsset.browser_download_url) {
    console.error('No atom-api.json asset found in latest release');
    process.exit(1);
  }
  const atomApi = await getJson(apiAsset.browser_download_url);
  const { classes } = atomApi;
  const publicClasses: Record<string, any[]> = {};
  for (const name of Object.keys(classes)) {
    const { instanceProperties, instanceMethods } = classes[name];
    const properties = (instanceProperties || [])
      .filter(isVisible)
      .map((p: any) => convertPropertyToSuggestion(name, p))
      .sort(textComparator);
    const methods = (instanceMethods || [])
      .filter(isVisible)
      .map((m: any) => convertMethodToSuggestion(name, m))
      .sort(textComparator);
    if (properties.length > 0 || methods.length > 0) {
      publicClasses[name] = properties.concat(methods);
    }
  }
  fs.writeFileSync('completions.json', JSON.stringify(publicClasses, null, '  '));
}

main().catch(err => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
