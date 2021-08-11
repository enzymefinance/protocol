import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function allowedAdapterIncomingAssetsArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function guaranteedRedemptionArgs({
  startTimestamp,
  duration,
}: {
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [startTimestamp, duration]);
}

export function investorWhitelistArgs({
  investorsToAdd = [],
  investorsToRemove = [],
}: {
  investorsToAdd?: AddressLike[];
  investorsToRemove?: AddressLike[];
} = {}) {
  return encodeArgs(['address[]', 'address[]'], [investorsToAdd, investorsToRemove]);
}

export function minMaxInvestmentArgs({
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [minInvestmentAmount, maxInvestmentAmount]);
}
