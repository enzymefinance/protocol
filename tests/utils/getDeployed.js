import fs from 'fs';
import path from 'path';

const outDir = path.join(__dirname, '../../build/contracts');

// TODO: own file?
// or merge with 'deploy-contract'
const getArtifact = contractName => {
  return JSON.parse(
    fs.readFileSync(path.join(outDir, `${contractName}.json`))
  );
}

export const getDeployed = (contractName, web3, address=undefined) => {
  const artifact = getArtifact(contractName);
  if (address === undefined)
    address = artifact.networks['1'].address; // TODO: detect network id
  return new web3.eth.Contract(artifact.abi, address);
}
