#!/usr/bin/env node

const fs = require('fs');

if (process.argv.length != 4) {
  console.log('Usage: extract_build.js <buildfile> <outdir>');
  process.exit(1);
}

const outDir = process.argv[3];
const compiledFiles = JSON.parse(fs.readFileSync(process.argv[2])).contracts;

if (!fs.existsSync(outDir))
  fs.mkdirSync(outDir)

// TODO: fail on overwriting an already-extracted file from this build
// (In that case we have duplicate source contracts, so the extraction may be bogus)
for (filepath of Object.keys(compiledFiles)) {
  const contracts = compiledFiles[filepath];
  for (name of Object.keys(contracts)) {
    fs.writeFileSync(
      `${outDir}/${name}.abi`,
      JSON.stringify(contracts[name].abi)
    );
    fs.writeFileSync(
      `${outDir}/${name}.bin`,
      contracts[name].evm.bytecode.object + '\n'
    );
    fs.writeFileSync(
      `${outDir}/${name}.bin-runtime`,
      contracts[name].evm.deployedBytecode.object + '\n'
    );
  }
}
