import api from "./api";

async function getChainTime() {
  const blockNo = await api.eth.blockNumber();
  const block = await api.eth.getBlockByNumber(blockNo);
  return Math.round(new Date(block.timestamp).valueOf() / 1000);
}

export default getChainTime;
