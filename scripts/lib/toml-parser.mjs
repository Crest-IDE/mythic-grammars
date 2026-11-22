import fs from 'node:fs';
import { parse as parseToml } from 'smol-toml';

// Known overrides for archived/outdated grammar repositories in Helix
const KNOWN_GRAMMAR_OVERRIDES = {
  yaml: {
    git: 'https://github.com/tree-sitter-grammars/tree-sitter-yaml',
    rev: 'master'
  }
};

/**
 * Parses languages.toml into structured grammars and languages list.
 *
 * @param {string} tomlContent - The raw TOML string
 * @returns {{ grammars: Map<string, object>, languages: Array<object> }}
 */
export function parseHelixLanguages(tomlContent) {
  const parsed = parseToml(tomlContent);

  const grammarList = Array.isArray(parsed.grammar) ? parsed.grammar : [];
  const languageList = Array.isArray(parsed.language) ? parsed.language : [];

  const grammars = new Map();
  for (const g of grammarList) {
    if (g.name && g.source) {
      const override = KNOWN_GRAMMAR_OVERRIDES[g.name];
      grammars.set(g.name, {
        name: g.name,
        source: {
          git: override?.git || g.source.git,
          rev: override?.rev || g.source.rev,
          subpath: override?.subpath || g.source.subpath || null
        }
      });
    }
  }

  const languages = [];
  for (const l of languageList) {
    if (l.name) {
      languages.push({
        name: l.name,
        scope: l.scope || `source.${l.name}`,
        grammar: l.grammar || l.name,
        fileTypes: Array.isArray(l['file-types']) ? l['file-types'] : [],
        commentTokens: l['comment-tokens'] || (l['comment-token'] ? [l['comment-token']] : []),
        indent: l.indent || null,
        injectionRegex: l['injection-regex'] || null
      });
    }
  }

  return { grammars, languages };
}
