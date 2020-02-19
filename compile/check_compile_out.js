#!/usr/bin/env node

const fs = require('fs');

if (process.argv.length != 3) {
  console.log('Usage: check_compile_out.js <outputjson>');
  process.exit(1);
} else {
  const out = JSON.parse(fs.readFileSync(process.argv[2]));
  Object.values(out.errors).map(e => {
    if (e.severity == 'error') {
      console.error(JSON.stringify(out, 0, '  '));
      process.exit(1);
    }
  });
  process.exit(0);
}
