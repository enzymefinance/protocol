import { retrieveContract } from "../lib/contracts";

async function createStakingFeed(opts, canonicalPriceFeed) {
  const receipt = await canonicalPriceFeed.methods.setupStakingPriceFeed().send(opts);
  const stakingFeedAddress = receipt.events.SetupPriceFeed.returnValues.ofPriceFeed;
  return retrieveContract("pricefeeds/StakingPriceFeed", stakingFeedAddress);
}

export default createStakingFeed;
