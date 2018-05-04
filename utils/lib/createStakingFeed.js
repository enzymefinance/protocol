import api from "./api";
import { retrieveContract } from "../lib/contracts";

async function createStakingFeed(opts, canonicalPriceFeed) {
  const txid = await canonicalPriceFeed.instance.setupStakingPriceFeed.postTransaction(opts);
  await canonicalPriceFeed._pollTransactionReceipt(txid);
  const receipt = await api.eth.getTransactionReceipt(txid)
  const setupLog = receipt.logs.find(
    e => e.topics[0] === api.util.sha3('SetupPriceFeed(address)')
  );
  const stakingFeedAddress = api.util.toChecksumAddress(`0x${setupLog.data.slice(-40)}`);
  return retrieveContract("pricefeeds/StakingPriceFeed", stakingFeedAddress);
}

export default createStakingFeed;
