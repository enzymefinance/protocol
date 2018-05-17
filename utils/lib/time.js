import api from "./api";

// get timestamp for a tx in seconds
async function txidToTimestamp(txid) {
  const receipt = await api.eth.getTransactionReceipt(txid);
  const timestamp = (await api.eth.getBlockByHash(receipt.blockHash)).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

// get latest timestamp in seconds
async function getBlockTimestamp() {
  const timestamp = (await api.eth.getBlockByNumber('latest')).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

async function mineToTime(timestamp) {
  while (await getBlockTimestamp() < timestamp) {
    await sleep (500);
    await api.eth.sendTransaction();
  }
}

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

export {
  txidToTimestamp,
  getBlockTimestamp,
  mineToTime,
  mineSeconds,
  sleep
};
