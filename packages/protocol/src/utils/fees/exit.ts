import { AddressLike } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish, constants } from 'ethers';
import { encodeArgs } from '../encoding';

export function exitRateBurnFeeConfigArgs({
  inKindRate = 0,
  specificAssetsRate = 0,
}: {
  inKindRate?: BigNumberish;
  specificAssetsRate?: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [inKindRate, specificAssetsRate]);
}

export function exitRateDirectFeeConfigArgs({
  inKindRate = 0,
  specificAssetsRate = 0,
  recipient = constants.AddressZero,
}: {
  inKindRate?: BigNumberish;
  specificAssetsRate?: BigNumberish;
  recipient?: AddressLike;
}) {
  return encodeArgs(['uint256', 'uint256', 'address'], [inKindRate, specificAssetsRate, recipient]);
}

export function exitRateFeeSharesDue({ rate, sharesRedeemed }: { rate: BigNumberish; sharesRedeemed: BigNumberish }) {
  return BigNumber.from(sharesRedeemed).mul(rate).div(BigNumber.from(10000));
}
