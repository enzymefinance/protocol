const Compile = require("truffle-workflow-compile");
const path = require("path");
const fs = require("fs");
const mkdirp = require('mkdirp');

const compileOptions = {
  contracts_directory: path.join(__dirname, "../src"),
  contracts_build_directory: "out",
  all: true,
  solc: {
    optimizer: {
      enabled: true,
      runs: 1,
    },
  },
};

Compile.compile(compileOptions, (err, result) => {
  if (err) {
    console.log(err.message);
    return;
  }
  const formattedDir = path.join(__dirname, "../out/formatted/");
  if (!fs.existsSync(formattedDir)) {
    fs.mkdirSync(formattedDir);
  }
  Object.entries(result).forEach(([, value]) => {
    const cNameRegex = new RegExp('(src)(.*\/)(.*.sol)$');
    const contractFolderName = value.sourcePath;
    const [, , contractPath] = cNameRegex.exec(contractFolderName);
    const contractDir = formattedDir + contractPath;

    mkdirp.sync(contractDir);
    fs.writeFileSync(
      `${contractDir + value.contract_name}.abi`,
      JSON.stringify(value.abi, null, "  "),
      "utf8",
    );
    fs.writeFileSync(
      `${contractDir +  value.contract_name}.bin`,
      value.bytecode,
      "utf8",
    );
    console.log(`Compiled ${value.contract_name}`);
  });
  console.log("Successfully compiled");
});
