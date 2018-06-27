import { retrieveContract } from "../lib/contracts";

async function createStakingFeed(opts, canonicalPriceFeed) {
  const clonedOpts = {...opts};
  const txid = await canonicalPriceFeed.methods.setupStakingPriceFeed().send(clonedOpts);
  const stakingFeedAddress = txid.events.SetupPriceFeed.returnValues.ofPriceFeed;
  return retrieveContract("pricefeeds/StakingPriceFeed", stakingFeedAddress);
}

export default createStakingFeed;
