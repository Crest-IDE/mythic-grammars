import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeQuery,
  parseInherits,
  resolveQueryWithInheritance
} from '../scripts/lib/query-sanitizer.mjs';

test('sanitizeQuery transforms #any-of? to standard #match?', () => {
  const input = `
    ((identifier) @keyword
      (#any-of? @keyword "async" "await" "defer"))
  `;

  const output = sanitizeQuery(input);
  assert.ok(output.includes('(#match? @keyword "^(?:async|await|defer)$")'));
  assert.ok(!output.includes('#any-of?'));
});

test('sanitizeQuery properly escapes special regex characters in #any-of?', () => {
  const input = `
    ((identifier) @operator
      (#any-of? @operator "++" "--" "==" "!=" "$foo"))
  `;

  const output = sanitizeQuery(input);
  assert.ok(output.includes('(#match? @operator "^(?:\\+\\+|--|==|!=|\\$foo)$")'));
});

test('sanitizeQuery transforms #not-any-of? to standard #not-match?', () => {
  const input = `
    ((identifier) @var
      (#not-any-of? @var "this" "self" "super"))
  `;

  const output = sanitizeQuery(input);
  assert.ok(output.includes('(#not-match? @var "^(?:this|self|super)$")'));
  assert.ok(!output.includes('#not-any-of?'));
});

test('sanitizeQuery comments out unsupported predicates (#is-not?, #has-ancestor?)', () => {
  const input = `
    ((identifier) @variable
      (#is-not? local)
      (#has-ancestor? @variable "function_definition"))
  `;

  const output = sanitizeQuery(input);
  assert.ok(output.includes('; [sanitizer: stripped unsupported predicate: (#is-not? local)]'));
  assert.ok(output.includes('; [sanitizer: stripped unsupported predicate: (#has-ancestor? @variable "function_definition")]'));
});

test('parseInherits parses language inheritance accurately', () => {
  assert.deepEqual(parseInherits('; inherits: ecmascript, jsx'), ['ecmascript', 'jsx']);
  assert.deepEqual(parseInherits(';   inherits: c'), ['c']);
  assert.deepEqual(parseInherits('; no inherits here\n(identifier) @id'), []);
});

test('resolveQueryWithInheritance merges queries in correct order', () => {
  const queryMap = {
    c: '(primitive_type) @type.builtin',
    cpp: '; inherits: c\n(class_specifier name: (type_identifier) @type)'
  };

  const resolved = resolveQueryWithInheritance('cpp', queryMap);
  const sanitized = sanitizeQuery(resolved);

  assert.ok(sanitized.includes('; === Inherited from c ==='));
  assert.ok(sanitized.includes('(primitive_type) @type.builtin'));
  assert.ok(sanitized.includes('; === Language: cpp ==='));
  assert.ok(sanitized.includes('(class_specifier name: (type_identifier) @type)'));
});
