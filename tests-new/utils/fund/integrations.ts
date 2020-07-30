import { AddressLike, Call } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { encodeArgs } from '../common';

export interface IntegrationAdapterInterface {
  parseAssetsForMethod: Call<
    (
      _selector: ethers.utils.BytesLike,
      _encodedCallArgs: ethers.utils.BytesLike,
    ) => {
      spendAssets_: string[];
      spendAssetAmounts_: ethers.BigNumber[];
      incomingAssets_: string[];
      minIncomingAssetAmounts_: ethers.BigNumber[];
    }
  >;
}

export const takeOrderFragment = ethers.utils.FunctionFragment.fromString(
  'takeOrder(bytes,bytes)',
);

export const takeOrderSignature = takeOrderFragment.format();
export const takeOrderSelector = new ethers.utils.Interface([
  takeOrderFragment,
]).getSighash(takeOrderFragment);

export async function assetTransferArgs(
  adapter: IntegrationAdapterInterface,
  selector: ethers.utils.BytesLike,
  encodedCallArgs: ethers.utils.BytesLike,
) {
  const {
    spendAssets_,
    spendAssetAmounts_,
    incomingAssets_,
  } = await adapter.parseAssetsForMethod(selector, encodedCallArgs);

  return encodeArgs(
    ['address[]', 'uint[]', 'address[]'],
    [spendAssets_, spendAssetAmounts_, incomingAssets_],
  );
}

export async function kyberTakeOrderArgs(
  incomingAsset: AddressLike,
  expectedIncomingAssetAmount: ethers.BigNumberish,
  outgoingAsset: AddressLike,
  outgoingAssetAmount: ethers.BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [
      incomingAsset,
      expectedIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    ],
  );
}
