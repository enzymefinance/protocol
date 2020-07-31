import { AddressLike, Call, Contract } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, BytesLike, utils } from 'ethers';
import { encodeArgs } from '../common';

// prettier-ignore
export interface IntegrationAdapterInterface extends Contract {
  parseAssetsForMethod: Call<(_selector: BytesLike, _encodedCallArgs: BytesLike) => { spendAssets_: string[]; spendAssetAmounts_: BigNumber[]; incomingAssets_: string[]; minIncomingAssetAmounts_: BigNumber[]; }>;
}

export const takeOrderFragment = utils.FunctionFragment.fromString(
  'takeOrder(bytes,bytes)',
);

export const takeOrderSignature = takeOrderFragment.format();
export const takeOrderSelector = new utils.Interface([
  takeOrderFragment,
]).getSighash(takeOrderFragment);

export async function assetTransferArgs(
  adapter: IntegrationAdapterInterface,
  selector: BytesLike,
  encodedCallArgs: BytesLike,
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
  expectedIncomingAssetAmount: BigNumberish,
  outgoingAsset: AddressLike,
  outgoingAssetAmount: BigNumberish,
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
