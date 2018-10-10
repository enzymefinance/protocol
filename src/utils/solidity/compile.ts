import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
import * as solc from "solc";

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

  return output;
};

if (require.main === module) {
  compile("prices/StakingPriceFeed.sol");
}
