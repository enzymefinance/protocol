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
    const contract = contracts[name];
    const { output } = JSON.parse(contract.metadata);
    const { userdoc, devdoc } = output;

    fs.writeFileSync(
      `${outDir}/${name}-docs.json`,
      JSON.stringify({ userdoc, devdoc }, undefined, 2)
    );
    fs.writeFileSync(
      `${outDir}/${name}.abi`,
      JSON.stringify(contract.abi, undefined, 2)
    );
    fs.writeFileSync(
      `${outDir}/${name}.bin`,
      contract.evm.bytecode.object + "\n"
    );
    fs.writeFileSync(
      `${outDir}/${name}.bin-runtime`,
      contract.evm.deployedBytecode.object + "\n"
    );
  }
}
