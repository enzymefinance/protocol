import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function poolTogetherV4LendArgs({ ptToken, amount }: { ptToken: AddressLike; amount: BigNumberish }) {
  return encodeArgs(['address', 'uint256'], [ptToken, amount]);
}

export function poolTogetherV4RedeemArgs({ ptToken, amount }: { ptToken: AddressLike; amount: BigNumberish }) {
  return encodeArgs(['address', 'uint256'], [ptToken, amount]);
}

export function poolTogetherV4ClaimRewardsArgs({
  prizeDistributor,
  drawIds,
  winningPicks,
}: {
  prizeDistributor: AddressLike;
  drawIds: BigNumberish[];
  winningPicks: BytesLike;
}) {
  return encodeArgs(['address', 'uint32[]', 'bytes'], [prizeDistributor, drawIds, winningPicks]);
}
