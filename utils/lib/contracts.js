import * as path from 'path';
import * as fs from 'fs';
import web3 from './web3';

const outpath = path.join(__dirname, '..', '..', 'out');

/**
 * Deploy a contract, and get back an instance.
 * @param {string} contractPath - Relative path to the contract, without its extension
 * @param {Object} optsIn - Deployment options for the contract
 * @param {[*]} constructorArgs - Arguments to be passed to the contract constructor
 * @param {...*} rest - Catch extra parameters to the parity.js deploy function TODO: remove?
 * @returns {Object} - Instance of the deployed contract
 */
async function deployContract(contractPath, optsIn = {}, constructorArgs = [], ...rest) {

  const options = Object.assign({}, optsIn); // clone object value instead of reference
  const options2 = Object.assign({}, options); // clone object value instead of reference
  const filepath = path.resolve(outpath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${filepath}.abi`, 'utf8'));

  const bytecode = `0x${fs.readFileSync(`${filepath}.bin`, 'utf8')}`;
  const contract = new web3.eth.Contract(abi, options);
  const deployTx = await contract.deploy({data: bytecode, arguments: constructorArgs});
  // console.log(deployTx)
  // console.log(await deployTx.estimateGas())
  const deployedContract = await deployTx.send(options2);
  if(process.env.CHAIN_ENV !== 'development')
    console.log(`Deployed ${contractPath}\nat ${deployedContract.options.address}\n`);
  return deployedContract;
}

/**
 * Get a contract instance with its name and address.
 * @param {string} contractPath - Relative path to the contract, without its extension
 * @param {string} address - Address of the deployed contract
 * @returns {Object} - Instance of the deployed contract
 */
async function retrieveContract(contractPath, address) {
  if(address === undefined || parseInt(address, 16) === 0) {
    throw new Error('Address is undefined or 0x0');
  }
  const filepath = path.resolve(outpath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${filepath}.abi`, 'utf8'));
  return new web3.eth.Contract(abi, address);
}

export { deployContract, retrieveContract }
