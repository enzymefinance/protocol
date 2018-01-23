import * as path from 'path';
import * as fs from 'fs';
import api from './api';

// module-level variables
const outpath = path.join(__dirname, '..', '..', 'out');

// inputOptions : Deployment options for the contract
// constructorArgs : Arguments to be passed to the contract constructor
// ...rest : catch extra parameters to the parity.js deploy function
// returns: instance of the deployed contract
async function deployContract(contractPath, inputOptions = {}, constructorArgs = [], ...rest) {
  const options = inputOptions;
  const filepath = path.resolve(outpath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${filepath}.abi`, 'utf8'));
  const bytecode = `0x${fs.readFileSync(`${filepath}.bin`, 'utf8')}`;
  options.data = bytecode;
  const deployedAddress = await api.newContract(abi).deploy(options, constructorArgs, ...rest);
  console.log(`Deployed ${contractPath}\nat ${deployedAddress}\n`);
  return api.newContract(abi, deployedAddress);  // return instance
}

async function retrieveContract(contractPath, address) {
  const filepath = path.resolve(outpath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${filepath}.abi`, 'utf8'));
  return api.newContract(abi, address);
}

export { deployContract, retrieveContract }
