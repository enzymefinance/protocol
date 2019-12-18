#!/usr/bin/env node

const fs = require('fs');
const glob = require('glob');

const out_obj = {
  "language": "Solidity",
  "settings":
  {
    "remappings": [ "main=./src" ],
    "optimizer": {
      "enabled": true,
      "runs": 200
    },
    "evmVersion": "istanbul",
    "outputSelection": {
      "*": {
        "*": [
          "metadata",
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object"
        ]
      }
    }
  },
  "sources": {}
}

let solFiles;
if (process.argv.length == 2) {
  solFiles = glob.sync('./{src,tests}/**/*.sol');
} else if (process.argv[2] == '--help') {
  console.log('Usage: generate_input.js [input_file...]');
  process.exit(0);
} else {
  solFiles = process.argv.slice(2);
}

for (filename of solFiles) {
  const filecontents = fs.readFileSync(filename, 'utf8');
  out_obj.sources[filename] = { content: filecontents }
}

console.log(JSON.stringify(out_obj));
