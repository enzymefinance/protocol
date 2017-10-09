const Web3 = require('web3');
const environmentConfig = require('../deployment/environment.config.js');

const environment = 'development';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

function rpcCall(method, arg) {
  const req = {
    jsonrpc: '2.0',
    method,
    id: new Date().getTime()
  }
  if (arg) req.params = arg;
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(req, (err, result) => {
      if (err) return reject(err);
      if (result && result.error) {
        reject(new Error(`RPC Error: ${(result.error.message || result.error)}`))
      }
      resolve(result);
    })
  })
}

function mineBlock() {
  return rpcCall('evm_mine');
}

module.exports = {
  mineBlock
}
