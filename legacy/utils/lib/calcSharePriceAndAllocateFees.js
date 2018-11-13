import web3 from "./web3";

async function calcSharePriceAndAllocateFees(fund, manager, config) {
  const tx = await fund.accounting.methods.calcSharePriceAndAllocateFees().send(
    { from: manager, gas: 8000000, gasPrice: config.gasPrice },
  )
  const block = await web3.eth.getBlock(tx.blockNumber);
  return block.timestamp;
}

export default calcSharePriceAndAllocateFees;
