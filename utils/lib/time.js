import web3 from "./web3";

// get timestamp for a block in seconds
async function blockNumberToTimestamp(blockNumber) {
  const timestamp = (await web3.eth.getBlock(blockNumber)).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

// get timestamp for a tx in seconds
async function txidToTimestamp(txHash) {
  console.log(txHash)
  const timestamp = (await web3.eth.getBlock(txHash)).timestamp;
  console.log(timestamp)
  return Math.round(new Date(timestamp).getTime()/1000);
}

// get latest timestamp in seconds
async function currentTimestamp() {
  const timestamp = (await web3.eth.getBlock('latest')).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

// TODO: remove this in future (when parity devchain implements fast-forwarding blockchain time)
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function increaseTime(addSeconds) {
  await new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0', 
      method: 'evm_increaseTime', 
      params: [addSeconds], 
      id: new Date().getMilliseconds()
    }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
  await new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0', 
      method: 'evm_mine', 
      params: [], 
      id: new Date().getMilliseconds()
    }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
};

export {
  txidToTimestamp,
  currentTimestamp,
  sleep,
  increaseTime,
  blockNumberToTimestamp
};
