// `web3` must be available in the calling context
function rpcCall(method, arg) {
  if (!web3) throw new Error('web3 not available in this context');
  const req = {
    jsonrpc: '2.0',
    method: method,
    id: new Date().getTime()
  }
  if (arg) req.params = arg;
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(req, (err, result) => {
      if (err) return reject(err);
      if (result && result.error) {
        return reject(new Error('RPC Error: ' + (result.error.message || result.error)))
      }
      return resolve(result);
    })
  })
}

function mineBlock() {
  return rpcCall('evm_mine');
}

module.exports = {
  mineBlock
}
