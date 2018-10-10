import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
import * as solc from "solc";
import * as mkdirp from "mkdirp";
import * as R from "ramda";
import * as rimraf from "rimraf";

const debug = require("../getDebug").default(__filename);

const findImports = (missingPath: string) => {
  const candidates = glob.sync(`src/contracts/**/${missingPath}`);

  if (candidates.length > 1) {
    throw new Error(
      `Multiple source files named ${missingPath} found. ${candidates}`
    );
  }

  if (candidates.length === 0) {
    throw new Error(`Can not find import named: ${missingPath}`);
  }

  debug("Resolved import", missingPath, candidates[0]);

  const contents = fs.readFileSync(candidates[0], { encoding: "utf-8" });

  return {
    contents
  };
};

// Not used at the moment
const compile = (pathToSol: string) => {
  debug("Compiling ...", pathToSol);

  const parsed = path.parse(pathToSol);

  const absolutePathToSol = path.join(
    process.cwd(),
    "src/contracts",
    pathToSol
  );

  const source = fs.readFileSync(absolutePathToSol, { encoding: "utf-8" });

  const input = {
    sources: {
      [parsed.base]: source
    }
  };

  const output = solc.compile(input, 1, findImports);

  debug("Compiled", pathToSol);

  output.errors.forEach(debug);

  const targetDir = path.join(process.cwd(), "out", parsed.dir);
  const targetPath = path.join(targetDir, `${parsed.name}.json`);

  debug("Writing to", targetPath);

  mkdirp.sync(targetDir);

  fs.writeFileSync(targetPath, JSON.stringify(output, null, 2));

  return output;
};

const writeFiles = (compileOutput, contract) => {
  const [sourceName, contractName] = contract.split(":");

  debug("Writing", contract);

  const parsedPath = path.parse(sourceName);
  const targetDir = path.join(process.cwd(), "out", parsedPath.dir);
  const targetBasePath = path.join(targetDir, contractName);

  mkdirp.sync(targetDir);

  if (fs.existsSync(`${targetBasePath}.abi`)) {
    throw new Error(
      `Contract name duplication detected: ${targetBasePath}.abi. Please make sure that every contract is uniquely named inside the same directory.`
    );
  }

  fs.writeFileSync(`${targetBasePath}.bin`, compileOutput.bytecode);
  fs.writeFileSync(
    `${targetBasePath}.abi.json`,
    JSON.stringify(JSON.parse(compileOutput.interface), null, 2)
  );
  fs.writeFileSync(`${targetBasePath}.abi`, compileOutput.interface);
  fs.writeFileSync(
    `${targetBasePath}.gasEstimates.json`,
    JSON.stringify(compileOutput.gasEstimates, null, 2)
  );
};

const compileAll = (query = "src/contracts/**/*.sol") => {
  const candidates = glob.sync(query);

  debug(`Compiling ${query}, ${candidates.length} files ...`);

  const unmerged = candidates.map(path => ({
    [path.substr(14)]: fs.readFileSync(path, { encoding: "utf-8" })
  }));

  const sources = R.mergeAll(unmerged);
  const output = solc.compile({ sources }, 1, findImports);

  output.errors.forEach(error => process.stderr.write(error)); // debug);

  debug("Writing compilation results");

  // Delete and recreate /out
  rimraf.sync("out");
  mkdirp.sync("out");

  fs.writeFileSync("out/compilerResult.json", JSON.stringify(output, null, 2));

  if (output.errors.length > 0) {
    fs.writeFileSync("out/compilerErrors.txt", output.errors.join("\n\n"));
  }

  R.forEachObjIndexed(writeFiles, output.contracts);

  debug("Finished");
};

if (require.main === module) {
  // compile("exchanges/MatchingMarket.sol");
  compileAll();
}
