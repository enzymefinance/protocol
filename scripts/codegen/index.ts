import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import rimraf from 'rimraf';
import { ethers } from 'ethers';
import { Project, QuoteKind, IndentationText } from 'ts-morph';
import { generate, ContractData } from './utils/generate';

(async () => {
  const packageRoot = path.join(__dirname, '..', '..');
  const codegenOut = path.resolve(packageRoot, 'tests', 'framework', 'codegen');
  const contractsOut = path.join(packageRoot, 'build', 'contracts');
  const prettierConfig = prettier.resolveConfig.sync(packageRoot);
  const contractNames = [
    "Registry",
    "Engine",
    "Hub",
  ];

  rimraf.sync(codegenOut);
  if (!fs.existsSync(codegenOut)) {
    fs.mkdirSync(codegenOut, { recursive: true });
  }

  const codegenSubjects = contractNames.map((contractName) => {
    try {
      const buildArtifactPath = path.join(contractsOut, `${contractName}.json`);
      if (!fs.existsSync(buildArtifactPath)) {
        throw new Error(`Missing contract build artifact for ${contractName}.`);
      }

      const buildArtifact = JSON.parse(fs.readFileSync(buildArtifactPath, 'utf8'));

      return {
        name: contractName,
        interface: new ethers.utils.Interface(buildArtifact.abi),
        userdoc: buildArtifact.userdoc,
        devdoc: buildArtifact.devdoc,
      } as ContractData;
    } catch (error) {
      throw new Error(`Failed to load source data for contract ${contractName}: ${error}`);
    }
  });

  const codegenProject = new Project({
    tsConfigFilePath: `${process.cwd()}/tsconfig.json`,
    addFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    manipulationSettings: {
      useTrailingCommas: true,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  generate(codegenProject, codegenOut, codegenSubjects, (source: string) => {
    const options: prettier.Options = { ...prettierConfig, parser: 'typescript' };
    return prettier.format(source, options);
  });

  await codegenProject.save();
})();
