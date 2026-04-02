#!/usr/bin/env node

const { run } = require('../src/cli.js');

run(process.argv.slice(2)).catch((error) => {
  if (error && error.signal) {
    process.kill(process.pid, error.signal);
    return;
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(error && error.exitCode ? error.exitCode : 1);
}).then((exitCode) => {
  if (typeof exitCode === 'number') {
    process.exit(exitCode);
  }
});
