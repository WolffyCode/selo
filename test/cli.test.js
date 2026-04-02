const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildVersionString,
  parseCliArgs,
  reconcileSelection,
} = require('../src/cli.js');

test('reconcileSelection keeps the same provider selected when it still exists', () => {
  const nextId = reconcileSelection(
    'b',
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    { currentProviderClaude: 'a' },
    {},
  );

  assert.equal(nextId, 'b');
});

test('reconcileSelection falls back to currentProviderClaude when the selected provider is removed', () => {
  const nextId = reconcileSelection(
    'b',
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'a' }, { id: 'c' }],
    { currentProviderClaude: 'a' },
    { lastProviderClaude: 'c' },
  );

  assert.equal(nextId, 'a');
});

test('parseCliArgs maps -d and -v correctly', () => {
  assert.deepStrictEqual(parseCliArgs(['-d', '--print', 'hi']), {
    showVersion: false,
    danger: true,
    claudeArgs: ['--print', 'hi'],
  });
  assert.deepStrictEqual(parseCliArgs(['-v']), {
    showVersion: true,
    danger: false,
    claudeArgs: [],
  });
});

test('buildVersionString formats the selo version output', () => {
  assert.equal(buildVersionString('1.2.3'), 'selo v1.2.3');
});
