import api from "./api";
import web3 from "./web3";

// TODO: deprecate when removing parity.js
// get timestamp for a tx in seconds
async function txidToTimestamp(txid) {
  const receipt = await api.eth.getTransactionReceipt(txid);
  const timestamp = (await api.eth.getBlockByHash(receipt.blockHash)).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

// TODO: deprecate when removing parity.js
// get latest timestamp in seconds
async function getBlockTimestamp() {
  const timestamp = (await api.eth.getBlockByNumber('latest')).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

// TODO: deprecate when removing parity.js
async function mineToTime(timestamp) {
  while (await getBlockTimestamp() < timestamp) {
    await sleep (500);
    await api.eth.sendTransaction();
  }
}

// TODO: deprecate when removing parity.js
async function mineSeconds(seconds) {
  for (let i = 0; i < seconds; i++) {
    await sleep(1000);
    await api.eth.sendTransaction();
  }
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
  getBlockTimestamp,
  mineToTime,
  mineSeconds,
  sleep,
  increaseTime
};
