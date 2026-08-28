// Maintainer script: refresh completions.json. Not loaded at editor runtime.

import * as path from 'path';
import * as fs from 'fs';
import fetchPropertyDescriptions = require('./fetch-property-docs');

const PropertiesURL =
  'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/CSSCodeHints/CSSProperties.json';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

async function main(): Promise<void> {
  const [propertiesRaw, propertyDescriptions] = await Promise.all([
    getJson(PropertiesURL),
    fetchPropertyDescriptions()
  ]);
  if (!propertiesRaw) {
    console.error('No CSS properties payload');
    process.exit(1);
  }
  const properties: Record<string, any> = {};
  const sortedPropertyNames = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sorted-property-names.json'), 'utf8')
  );
  for (const propertyName of sortedPropertyNames) {
    const metadata = propertiesRaw[propertyName];
    if (!metadata) continue;
    metadata.description = propertyDescriptions[propertyName];
    properties[propertyName] = metadata;
    if (propertyDescriptions[propertyName] == null) {
      console.warn(`No description for property ${propertyName}`);
    }
  }
  for (const propertyName of Object.keys(propertiesRaw)) {
    if (sortedPropertyNames.indexOf(propertyName) < 0) {
      console.warn(`Ignoring ${propertyName}; not in sorted-property-names.json`);
    }
  }
  const tags = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'html-tags.json'), 'utf8')
  );
  const pseudoSelectors = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'pseudo-selectors.json'), 'utf8')
  );
  const completions = { tags, properties, pseudoSelectors };
  fs.writeFileSync(
    path.join(__dirname, 'completions.json'),
    `${JSON.stringify(completions, null, '  ')}\n`
  );
}

main().catch(err => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
