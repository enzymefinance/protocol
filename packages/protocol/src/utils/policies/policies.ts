import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function adapterBlacklistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export function adapterWhitelistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export function assetBlacklistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function assetWhitelistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function buySharesCallerWhitelistArgs({
  buySharesCallersToAdd = [],
  buySharesCallersToRemove = [],
}: {
  buySharesCallersToAdd?: AddressLike[];
  buySharesCallersToRemove?: AddressLike[];
} = {}) {
  return encodeArgs(['address[]', 'address[]'], [buySharesCallersToAdd, buySharesCallersToRemove]);
}

export function buySharesPriceFeedToleranceArgs(tolerance: BigNumberish) {
  return encodeArgs(['uint256'], [tolerance]);
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

export function maxConcentrationArgs(maxConcentration: BigNumberish) {
  return encodeArgs(['uint256'], [maxConcentration]);
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
