import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeQuery,
  resolveQueryWithInheritance
} from './lib/query-sanitizer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const QUERIES_DIST = path.resolve(DIST_DIR, 'queries');

async function getQueriesDirectory() {
  const args = process.argv.slice(2);
  const pathArg = args.find((a) => a.startsWith('--queries='));
  if (pathArg) {
    return path.resolve(pathArg.split('=')[1]);
  }

  const localQueries = path.resolve(ROOT_DIR, '../helix/runtime/queries');
  if (fs.existsSync(localQueries)) {
    console.log(`[sanitize] Using local Helix queries: ${localQueries}`);
    return localQueries;
  }

  return null;
}

async function main() {
  const queriesDir = await getQueriesDirectory();
  if (!queriesDir) {
    console.warn('[sanitize] No local Helix queries found. Skipping local batch query extraction.');
    return;
  }

  fs.mkdirSync(QUERIES_DIST, { recursive: true });

  const entries = fs.readdirSync(queriesDir, { withFileTypes: true });
  const rawQueryMap = new Map();

  // 1. Ingest all raw highlights.scm files
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const langName = entry.name;
      const highlightFile = path.join(queriesDir, langName, 'highlights.scm');
      if (fs.existsSync(highlightFile)) {
        const content = fs.readFileSync(highlightFile, 'utf-8');
        rawQueryMap.set(langName, content);
      }
    }
  }

  console.log(`[sanitize] Found ${rawQueryMap.size} raw highlights.scm files.`);

  // 2. Resolve inheritance and sanitize each language
  let processedCount = 0;
  const manifest = {};

  for (const [langName] of rawQueryMap) {
    const resolved = resolveQueryWithInheritance(langName, rawQueryMap);
    const sanitized = sanitizeQuery(resolved);

    const outFile = path.join(QUERIES_DIST, `${langName}.scm`);
    fs.writeFileSync(outFile, sanitized, 'utf-8');

    manifest[langName] = {
      file: `${langName}.scm`,
      bytes: Buffer.byteLength(sanitized, 'utf-8')
    };
    processedCount++;
  }

  const manifestPath = path.join(DIST_DIR, 'queries-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`[sanitize] Successfully sanitized and wrote ${processedCount} queries to ${QUERIES_DIST}`);
}

main().catch((err) => {
  console.error('[sanitize] Error:', err);
  process.exit(1);
});
