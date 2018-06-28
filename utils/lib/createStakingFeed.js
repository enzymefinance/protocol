import { retrieveContract } from "../lib/contracts";

async function createStakingFeed(opts, canonicalPriceFeed) {
  const txid = await canonicalPriceFeed.methods.setupStakingPriceFeed().send(opts);
  const stakingFeedAddress = txid.events.SetupPriceFeed.returnValues.ofPriceFeed;
  return retrieveContract("pricefeeds/StakingPriceFeed", stakingFeedAddress);
}

export default createStakingFeed;
