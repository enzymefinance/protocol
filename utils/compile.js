const Compile = require("truffle-workflow-compile");
const path = require("path");
const fs = require("fs");

const compileOptions = {
  contracts_directory: path.join(__dirname, "../src"),
  contracts_build_directory: "out",
  all: true,
  solc: {
    optimizer: {
      enabled: true,
      runs: 1
    }
  }
};

Compile.compile(compileOptions, (err, result) => {
  if (err) {
    console.log(err);
    return;
  }
  const abiDir = path.join(__dirname, "../out/abi/");
  const binDir = path.join(__dirname, "../out/bin/");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir);
  }
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
  }
  Object.entries(result).forEach(([, value]) => {
    fs.writeFileSync(
      `${abiDir + value.contract_name  }.abi`,
      JSON.stringify(value.abi, null, "  "),
      "utf8",
    );
    fs.writeFileSync(
      `${binDir + value.contract_name  }.bin`,
      value.bytecode,
      "utf8",
    );
    console.log(`Compiled ${  value.contract_name}`);
  });
  console.log("Successfully compiled");
});
