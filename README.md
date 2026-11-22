# @crest-ide/mythic-grammars 🔮⚡

> **Automated Cloud Compiler for Tree-sitter WebAssembly (`.wasm`) binaries and Sanitized Helix SCM Highlight Queries.**

Powers syntax highlighting for [Mythic-Editor](https://github.com/Crest-IDE/Mythic-Editor) and [Crest-Editor](https://github.com/Crest-IDE/Crest-Editor).

---

## 🌟 Why This Exists

1. **Zero Phone/Termux Mobile Data Waste**:
   Compiling Tree-sitter C/C++ grammars to `.wasm` requires heavy tooling (LLVM, Emscripten `emcc`, CMake, Python). This repository moves 100% of the compilation pipeline into **GitHub Actions cloud runners**.
2. **Upstream Helix Single Source of Truth**:
   Helix Editor maintains the most comprehensive and battle-tested `languages.toml` file with exact Git commit hashes (`rev`) and high-quality queries (`highlights.scm`) for 300+ languages.
3. **Automated SCM Sanitization for `web-tree-sitter`**:
   Helix queries use custom Rust predicates (such as `(#any-of? ...)` and `(#is-not? ...)`) that throw errors or fail in standard `web-tree-sitter` WASM engines. Our query sanitizer transpiles them automatically into standard, high-performance regex patterns:
   ```lisp
   ;; Original Helix Query:
   (#any-of? @keyword "async" "await" "defer")

   ;; Auto-Transpiled Standard Query:
   (#match? @keyword "^(?:async|await|defer)$")
   ```
4. **Inheritance Resolution**:
   Automatically flattens and resolves `; inherits: base1,base2` directives so web editors can download a single self-contained `.scm` file without complex client-side merge logic.

---

## 🏗️ Architecture Pipeline

```text
Helix Master (languages.toml)
       │
       ▼
[scripts/parse-languages.mjs] ──► dist/languages.json (300+ grammars catalog)
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[scripts/sanitize-queries.mjs]   [scripts/build.mjs]
       │                                 │
  Helix queries/                   Git Clone @ rev
       │                                 │
  Sanitize #any-of?              tree-sitter build --wasm (emcc)
  Resolve inheritance                    │
       │                                 ▼
       ▼                         dist/wasms/*.wasm
dist/queries/*.scm                       │
       │                                 │
       └────────────────┬────────────────┘
                        ▼
            GitHub Actions Release (latest)
      (Direct CDN URLs for Mythic / Crest Editor)
```

---

## 🎯 Language Tiers

- **Tier 1 (Core 25 languages)**: `rust`, `python`, `javascript`, `typescript`, `tsx`, `c`, `cpp`, `go`, `html`, `css`, `json`, `yaml`, `toml`, `bash`, `markdown`, `java`, `kotlin`, `swift`, `php`, `ruby`, `sql`, `lua`, `zig`, `c-sharp`, `dockerfile`.
- **Tier 2 (Extended 50 languages)**: `dart`, `elixir`, `erlang`, `scala`, `clojure`, `r`, `haskell`, `ocaml`, `perl`, `diff`, `git-commit`, `make`, `cmake`, `graphql`, `protobuf`, `svelte`, `vue`, `latex`, `nix`, `julia`, `solidity`, etc.
- **Tier 3**: All remaining 200+ specialized grammars from Helix.

---

## 🚀 Triggering GitHub Actions Builds

1. Go to **Actions** in GitHub: `Crest-IDE/mythic-grammars`
2. Select **"Build Tree-Sitter WASMs & SCM Queries"**
3. Click **Run workflow**:
   - Choose Tier: `tier1` (default), `tier2`, or `all`
   - Or specify comma-separated languages: e.g. `rust,go,python,html`
   - Check **Create or update GitHub Release**

---

## 💻 Local Development & Testing

```bash
# Run unit tests (Query sanitizer & TOML parser)
npm test

# Parse Helix languages.toml
npm run parse

# Sanitize all Helix highlight queries
npm run sanitize
```

---

## 📦 Consuming in Editors (Lazy Loading)

Editors can fetch assets on-demand from the GitHub Release tag:

```typescript
// Fetch WASM binary
const wasmUrl = `https://github.com/Crest-IDE/mythic-grammars/releases/download/latest/tree-sitter-${lang}.wasm`;

// Fetch sanitized highlights query
const scmUrl = `https://github.com/Crest-IDE/mythic-grammars/releases/download/latest/${lang}.scm`;
```

---

## 📄 License

MIT © [Crest IDE](https://github.com/Crest-IDE)
