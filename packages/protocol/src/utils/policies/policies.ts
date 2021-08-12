import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function allowedAdapterIncomingAssetsPolicyArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function guaranteedRedemptionPolicyArgs({
  startTimestamp,
  duration,
}: {
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [startTimestamp, duration]);
}

export function allowedDepositRecipientsPolicyArgs({
  investorsToAdd = [],
  investorsToRemove = [],
}: {
  investorsToAdd?: AddressLike[];
  investorsToRemove?: AddressLike[];
} = {}) {
  return encodeArgs(['address[]', 'address[]'], [investorsToAdd, investorsToRemove]);
}

export function minMaxInvestmentPolicyArgs({
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [minInvestmentAmount, maxInvestmentAmount]);
}
