// Maintainer helper for update.ts. Not loaded at editor runtime.

import * as path from 'path';
import * as fs from 'fs';

const mdnCSSURL = 'https://developer.mozilla.org/en-US/docs/Web/CSS';
const mdnJSONAPI =
  'https://developer.mozilla.org/en-US/search.json?topic=css&highlight=false';
const PropertiesURL =
  'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/CSSCodeHints/CSSProperties.json';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

function filterExcerpt(propertyName: string, excerpt: string): string {
  const beginningPattern = /^the (css )?[a-z-]+ (css )?property (is )?(\w+)/i;
  excerpt = excerpt.replace(beginningPattern, match => {
    const matches = beginningPattern.exec(match);
    const firstWord = matches ? matches[4] : '';
    return firstWord ? firstWord[0].toUpperCase() + firstWord.slice(1) : match;
  });
  const periodIndex = excerpt.indexOf('.');
  if (periodIndex > -1) excerpt = excerpt.slice(0, periodIndex + 1);
  return excerpt;
}

async function fetchDocs(): Promise<Record<string, string> | null> {
  let properties: Record<string, any>;
  try {
    properties = await getJson(PropertiesURL);
  } catch (error: any) {
    console.error(error && error.message ? error.message : error);
    return null;
  }
  const MAX = 10;
  const queue = Object.keys(properties);
  const docs: Record<string, string> = {};

  async function run(propertyName: string): Promise<void> {
    const url = `${mdnJSONAPI}&q=${propertyName}`;
    try {
      const searchResults = await getJson(url);
      if (searchResults.documents) {
        for (const doc of searchResults.documents) {
          if (doc.url === `${mdnCSSURL}/${propertyName}`) {
            docs[propertyName] = filterExcerpt(propertyName, doc.excerpt);
            break;
          }
        }
      }
    } catch (error: any) {
      console.error(`Req failed ${url}; ${error && error.message}`);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < MAX; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const name = queue.pop();
          if (name) await run(name);
        }
      })()
    );
  }
  await Promise.all(workers);
  return docs;
}

if (require.main === module) {
  fetchDocs().then(docs => {
    if (docs) {
      fs.writeFileSync(
        path.join(__dirname, 'property-docs.json'),
        `${JSON.stringify(docs, null, '  ')}\n`
      );
    } else {
      console.error('No docs');
    }
  });
}

export = fetchDocs;
