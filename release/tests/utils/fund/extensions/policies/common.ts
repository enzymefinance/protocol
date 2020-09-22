import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../../../common';

// Policy Manager

export const policyHooks = {
  None: 0,
  BuyShares: 1,
  CallOnIntegration: 2,
};

export const policyHookExecutionTimes = {
  None: 0,
  Pre: 1,
  Post: 2,
};

export async function policyManagerConfigArgs(
  policies: AddressLike[],
  settingsData: BytesLike[],
) {
  return encodeArgs(['address[]', 'bytes[]'], [policies, settingsData]);
}

export function validateRulePreBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  minSharesQuantity: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, minSharesQuantity],
  );
}

export function validateRulePostBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  sharesBought: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, sharesBought],
  );
}

export function validateRulePreCoIArgs(
  selector: BytesLike,
  adapter: AddressLike,
  incomingAssets: AddressLike[],
  minIncomingAssetAmounts: BigNumberish[],
  spendAssets: AddressLike[],
  spendAssetAmounts: BigNumberish[],
) {
  return encodeArgs(
    ['bytes4', 'address', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [
      selector,
      adapter,
      incomingAssets,
      minIncomingAssetAmounts,
      spendAssets,
      spendAssetAmounts,
    ],
  );
}

export function validateRulePostCoIArgs(
  selector: BytesLike,
  adapter: AddressLike,
  incomingAssets: AddressLike[],
  incomingAssetAmounts: BigNumberish[],
  outgoingAssets: AddressLike[],
  outgoingAssetAmounts: BigNumberish[],
) {
  return encodeArgs(
    ['bytes4', 'address', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [
      selector,
      adapter,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets,
      outgoingAssetAmounts,
    ],
  );
}

// Policies

export async function assetBlacklistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}
