/**
 * Query Sanitizer for Tree-sitter SCM queries.
 *
 * Converts Helix and Neovim specific query predicates to standard
 * web-tree-sitter compatible syntax (#match?, #not-match?, #eq?, etc.)
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts string literals from an argument string.
 * e.g. '"let" "const" "var"' => ['let', 'const', 'var']
 */
function extractStringLiterals(argString) {
  const values = [];
  const regex = /"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = regex.exec(argString)) !== null) {
    // Unescape escaped quotes
    values.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return values;
}

/**
 * Sanitizes a single SCM query string.
 *
 * 1. Converts (#any-of? @capture "a" "b" ...) -> (#match? @capture "^(?:a|b)$")
 * 2. Converts (#not-any-of? @capture "a" "b" ...) -> (#not-match? @capture "^(?:a|b)$")
 * 3. Comments out unsupported predicates like (#is-not? ...), (#has-ancestor? ...)
 */
export function sanitizeQuery(scmSource) {
  if (!scmSource || typeof scmSource !== 'string') {
    return '';
  }

  let result = scmSource;

  // 1. Transform (#any-of? @capture "v1" "v2" ...)
  result = result.replace(
    /\(\s*#any-of\?\s+(@[a-zA-Z0-9_.-]+)\s+((?:"(?:[^"\\]|\\.)*"\s*)+)\)/g,
    (_, capture, argString) => {
      const literals = extractStringLiterals(argString);
      if (literals.length === 0) return '';
      const regexPattern = `^(?:${literals.map(escapeRegex).join('|')})$`;
      return `(#match? ${capture} "${regexPattern}")`;
    }
  );

  // 2. Transform (#not-any-of? @capture "v1" "v2" ...)
  result = result.replace(
    /\(\s*#not-any-of\?\s+(@[a-zA-Z0-9_.-]+)\s+((?:"(?:[^"\\]|\\.)*"\s*)+)\)/g,
    (_, capture, argString) => {
      const literals = extractStringLiterals(argString);
      if (literals.length === 0) return '';
      const regexPattern = `^(?:${literals.map(escapeRegex).join('|')})$`;
      return `(#not-match? ${capture} "${regexPattern}")`;
    }
  );

  // 3. Comment out predicates unsupported in standard web-tree-sitter (e.g. #is-not?, #has-ancestor?)
  result = result.replace(
    /\(\s*(#(?:is-not\?|is\?|has-ancestor\?|not-kind-eq\?|same-line\?|not-same-line\?)[^)]*)\)/g,
    '; [sanitizer: stripped unsupported predicate: ($1)]'
  );

  return result;
}

/**
 * Parses `; inherits: lang1,lang2` from query text.
 */
export function parseInherits(scmSource) {
  if (!scmSource) return [];
  const match = scmSource.match(/^;\s*inherits:\s*([^\r\n]+)/m);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolves query inheritance and produces a single unified query string.
 * @param {string} langName - The language identifier
 * @param {Map<string, string> | Record<string, string>} queryMap - Map of langName -> scmText
 * @param {Set<string>} [visited] - Internal set to prevent cyclic inheritance
 */
export function resolveQueryWithInheritance(langName, queryMap, visited = new Set()) {
  const getQuery = (name) => {
    if (queryMap instanceof Map) return queryMap.get(name);
    return queryMap[name];
  };

  if (visited.has(langName)) {
    return '';
  }
  visited.add(langName);

  const rawSource = getQuery(langName);
  if (!rawSource) return '';

  const inheritedLangs = parseInherits(rawSource);
  const parts = [];

  for (const parentLang of inheritedLangs) {
    const parentQuery = resolveQueryWithInheritance(parentLang, queryMap, new Set(visited));
    if (parentQuery) {
      parts.push(`; === Inherited from ${parentLang} ===\n${parentQuery}`);
    }
  }

  // Strip the inherits line from the current language so it doesn't duplicate
  const cleanCurrent = rawSource.replace(/^;\s*inherits:[^\r\n]*\r?\n?/m, '');
  parts.push(`; === Language: ${langName} ===\n${cleanCurrent}`);

  return parts.join('\n\n');
}
