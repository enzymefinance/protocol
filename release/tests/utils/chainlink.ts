import { MockChainlinkPriceSource } from '@melonproject/utils/dist/utils/contracts';
import { BigNumberish } from 'ethers';

export async function updateChainlinkAggregator(
  aggregator: MockChainlinkPriceSource,
  price?: BigNumberish,
) {
  const answer = price ?? (await aggregator.latestAnswer());
  const block = await aggregator.provider.getBlock('latest');
  await aggregator.setLatestAnswer(answer, block.timestamp);
}
