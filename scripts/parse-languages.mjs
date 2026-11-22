import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHelixLanguages } from './lib/toml-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

async function getTomlContent() {
  const args = process.argv.slice(2);
  const tomlArg = args.find((a) => a.startsWith('--toml='));
  if (tomlArg) {
    const tomlPath = tomlArg.split('=')[1];
    return fs.readFileSync(path.resolve(tomlPath), 'utf-8');
  }

  // Check sibling helix repo
  const localHelixToml = path.resolve(ROOT_DIR, '../helix/languages.toml');
  if (fs.existsSync(localHelixToml)) {
    console.log(`[parse] Using local Helix toml: ${localHelixToml}`);
    return fs.readFileSync(localHelixToml, 'utf-8');
  }

  // Fallback to upstream fetch
  const upstreamUrl = 'https://raw.githubusercontent.com/helix-editor/helix/master/languages.toml';
  console.log(`[parse] Fetching upstream Helix toml from ${upstreamUrl}...`);
  const res = await fetch(upstreamUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch upstream languages.toml: ${res.statusText}`);
  }
  return await res.text();
}

async function main() {
  const tomlContent = await getTomlContent();
  const { grammars, languages } = parseHelixLanguages(tomlContent);

  console.log(`[parse] Parsed ${grammars.size} grammars and ${languages.length} languages.`);

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const grammarsObj = Object.fromEntries(grammars);
  const catalog = {
    generatedAt: new Date().toISOString(),
    stats: {
      grammarsCount: grammars.size,
      languagesCount: languages.length
    },
    grammars: grammarsObj,
    languages
  };

  const outputPath = path.join(DIST_DIR, 'languages.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`[parse] Successfully wrote catalog to ${outputPath}`);
}

main().catch((err) => {
  console.error('[parse] Error:', err);
  process.exit(1);
});
