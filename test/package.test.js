const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('package exposes the selo bin entry', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  assert.equal(pkg.bin.selo, 'bin/selo.js');
});

test('package contains publish metadata for npm distribution', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  assert.equal(pkg.name, '@wolffycode/selo');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.deepStrictEqual(pkg.files, ['bin', 'src', 'README.md', 'LICENSE']);
  assert.equal(pkg.repository.url, 'git+https://github.com/WolffyCode/selo.git');
});
