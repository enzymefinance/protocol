import web3 from './web3';

async function getChainTime() {
  const block = await web3.eth.getBlock('latest');
  return block.timestamp;
}

export default getChainTime;
