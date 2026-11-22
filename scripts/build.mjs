import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TIER_1, TIER_2 } from './lib/tiers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const WASMS_DIR = path.resolve(DIST_DIR, 'wasms');
const CACHE_DIR = path.resolve(ROOT_DIR, '.cache/grammars');

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    langs: null,
    tier: null,
    all: false,
    skipExisting: false
  };

  for (const arg of args) {
    if (arg.startsWith('--langs=')) {
      options.langs = arg.split('=')[1].split(',').map((s) => s.trim().toLowerCase());
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--skip-existing') {
      options.skipExisting = true;
    }
  }

  return options;
}

function selectTargets(catalog, options) {
  const allGrammars = catalog.grammars;

  if (options.langs && options.langs.length > 0) {
    return options.langs
      .map((name) => allGrammars[name])
      .filter((g) => {
        if (!g) {
          console.warn(`[build] Grammar '${name}' not found in catalog.`);
          return false;
        }
        return true;
      });
  }

  if (options.tier === '1' || options.tier === 'tier1') {
    return TIER_1.map((name) => allGrammars[name]).filter(Boolean);
  }

  if (options.tier === '2' || options.tier === 'tier2') {
    return [...TIER_1, ...TIER_2].map((name) => allGrammars[name]).filter(Boolean);
  }

  if (options.all) {
    return Object.values(allGrammars);
  }

  // Default to Tier 1 if no flags given
  console.log('[build] No tier or lang specified. Defaulting to Tier 1 (25 core languages).');
  return TIER_1.map((name) => allGrammars[name]).filter(Boolean);
}

function buildGrammar(grammar, options) {
  const outWasmName = `tree-sitter-${grammar.name}.wasm`;
  const finalWasmPath = path.join(WASMS_DIR, outWasmName);

  if (options.skipExisting && fs.existsSync(finalWasmPath)) {
    console.log(`[build] Skipping ${grammar.name} (already built: ${outWasmName})`);
    return {
      name: grammar.name,
      wasmFile: outWasmName,
      bytes: fs.statSync(finalWasmPath).size,
      sha256: getSha256(finalWasmPath),
      status: 'cached'
    };
  }

  console.log(`\n==================================================`);
  console.log(`[build] Compiling: ${grammar.name}`);
  console.log(`[build] Repository: ${grammar.source.git} (${grammar.source.rev})`);
  console.log(`==================================================`);

  const repoDir = path.join(CACHE_DIR, grammar.name);

  // 1. Clone or fetch
  if (!fs.existsSync(repoDir)) {
    console.log(`[git] Cloning ${grammar.source.git}...`);
    execSync(`git clone --depth 1 ${grammar.source.git} "${repoDir}"`, { stdio: 'inherit' });
  }

  // 2. Checkout specified revision
  try {
    execSync(`git checkout ${grammar.source.rev}`, { cwd: repoDir, stdio: 'ignore' });
  } catch {
    // If shallow clone didn't include the rev, fetch it
    console.log(`[git] Fetching revision ${grammar.source.rev}...`);
    execSync(`git fetch --depth 1 origin ${grammar.source.rev} && git checkout ${grammar.source.rev}`, {
      cwd: repoDir,
      stdio: 'inherit'
    });
  }

  // 3. Determine working directory (subpath support)
  const workDir = grammar.source.subpath ? path.join(repoDir, grammar.source.subpath) : repoDir;

  // 3.5 Ensure tree-sitter configuration exists (for both legacy package.json and modern tree-sitter.json)
  const pkgPath = path.join(workDir, 'package.json');
  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {}
  }
  if (!pkg['tree-sitter']) {
    pkg.name = pkg.name || `tree-sitter-${grammar.name}`;
    pkg['tree-sitter'] = [
      {
        scope: `source.${grammar.name}`,
        fileTypes: [grammar.name]
      }
    ];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  }

  const tsConfigPath = path.join(workDir, 'tree-sitter.json');
  if (!fs.existsSync(tsConfigPath)) {
    const tsConfig = {
      grammars: [
        {
          name: grammar.name,
          scope: `source.${grammar.name}`,
          path: '.'
        }
      ]
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2), 'utf-8');
  }

  // Generate parser.c if missing
  const parserCPath = path.join(workDir, 'src/parser.c');
  const grammarJsPath = path.join(workDir, 'grammar.js');
  if (!fs.existsSync(parserCPath) && fs.existsSync(grammarJsPath)) {
    console.log(`[tree-sitter] Generating parser.c for ${grammar.name}...`);
    try {
      execSync('tree-sitter generate', { cwd: workDir, stdio: 'inherit' });
    } catch {
      execSync('npx --yes tree-sitter-cli generate', { cwd: workDir, stdio: 'inherit' });
    }
  }

  // 4. Compile with tree-sitter build --wasm
  console.log(`[wasm] Running tree-sitter build --wasm in ${workDir}...`);
  try {
    execSync('tree-sitter build --wasm', { cwd: workDir, stdio: 'inherit' });
  } catch {
    execSync('npx --yes tree-sitter-cli build --wasm', { cwd: workDir, stdio: 'inherit' });
  }

  // 5. Locate generated wasm file
  const wasmFiles = fs.readdirSync(workDir).filter((f) => f.endsWith('.wasm'));
  if (wasmFiles.length === 0) {
    throw new Error(`[build] No .wasm file generated for ${grammar.name} in ${workDir}`);
  }

  const generatedWasmPath = path.join(workDir, wasmFiles[0]);
  fs.copyFileSync(generatedWasmPath, finalWasmPath);
  console.log(`[build] Output copied to: ${finalWasmPath}`);

  return {
    name: grammar.name,
    wasmFile: outWasmName,
    bytes: fs.statSync(finalWasmPath).size,
    sha256: getSha256(finalWasmPath),
    status: 'success'
  };
}

async function main() {
  const options = parseCliArgs();

  // Ensure catalog exists
  const catalogPath = path.join(DIST_DIR, 'languages.json');
  if (!fs.existsSync(catalogPath)) {
    console.log('[build] Catalog not found, running parse...');
    execSync('npm run parse', { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  const targets = selectTargets(catalog, options);

  console.log(`[build] Target grammars to build (${targets.length}):`, targets.map((t) => t.name).join(', '));

  fs.mkdirSync(WASMS_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  let manifest = {
    updatedAt: new Date().toISOString(),
    grammars: {}
  };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {}
  }

  const results = [];
  const errors = [];

  for (const grammar of targets) {
    try {
      const res = buildGrammar(grammar, options);
      manifest.grammars[grammar.name] = res;
      results.push(res);
    } catch (err) {
      console.error(`[build] FAILED to build ${grammar.name}:`, err.message);
      errors.push({ name: grammar.name, error: err.message });
    }
  }

  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\n================ BUILD SUMMARY ================`);
  console.log(`Total Targets: ${targets.length}`);
  console.log(`Successful:    ${results.length}`);
  console.log(`Failed:        ${errors.length}`);
  if (errors.length > 0) {
    console.log(`Failed list:   ${errors.map((e) => e.name).join(', ')}`);
  }
  console.log(`Manifest:      ${manifestPath}`);
  console.log(`===============================================`);
}

main().catch((err) => {
  console.error('[build] Fatal error:', err);
  process.exit(1);
});
