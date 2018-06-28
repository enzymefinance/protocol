import web3 from './web3';

async function getChainTime() {
  const blockNo = await web3.eth.getBlockNumber();
  const block = await web3.eth.getBlock(blockNo);
  return block.timestamp;
}

export default getChainTime;
