import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHelixLanguages } from '../scripts/lib/toml-parser.mjs';

test('parseHelixLanguages parses grammars with git, rev, subpath', () => {
  const sampleToml = `
    [[grammar]]
    name = "rust"
    source = { git = "https://github.com/tree-sitter/tree-sitter-rust", rev = "abc1234" }

    [[grammar]]
    name = "typescript"
    source = { git = "https://github.com/tree-sitter/tree-sitter-typescript", rev = "def5678", subpath = "typescript" }

    [[language]]
    name = "rust"
    scope = "source.rust"
    file-types = ["rs"]
    comment-token = "//"
  `;

  const { grammars, languages } = parseHelixLanguages(sampleToml);

  assert.equal(grammars.size, 2);
  const rust = grammars.get('rust');
  assert.equal(rust.name, 'rust');
  assert.equal(rust.source.git, 'https://github.com/tree-sitter/tree-sitter-rust');
  assert.equal(rust.source.rev, 'abc1234');
  assert.equal(rust.source.subpath, null);

  const ts = grammars.get('typescript');
  assert.equal(ts.name, 'typescript');
  assert.equal(ts.source.subpath, 'typescript');

  assert.equal(languages.length, 1);
  assert.equal(languages[0].name, 'rust');
  assert.deepEqual(languages[0].fileTypes, ['rs']);
  assert.deepEqual(languages[0].commentTokens, ['//']);
});
