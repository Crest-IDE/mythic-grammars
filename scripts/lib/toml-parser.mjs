import fs from 'node:fs';
import { parse as parseToml } from 'smol-toml';

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
      grammars.set(g.name, {
        name: g.name,
        source: {
          git: g.source.git,
          rev: g.source.rev,
          subpath: g.source.subpath || null
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
