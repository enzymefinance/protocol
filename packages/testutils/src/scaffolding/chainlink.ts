import { BigNumberish } from 'ethers';
import { MockChainlinkPriceSource } from '@enzymefinance/protocol';

export async function updateChainlinkAggregator(aggregator: MockChainlinkPriceSource, price?: BigNumberish) {
  const answer = price ?? (await aggregator.latestAnswer());
  const block = await aggregator.provider.getBlock('latest');
  await aggregator.setLatestAnswer(answer, block.timestamp);
}
