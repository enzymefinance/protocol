import { Call, Contract } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { encodeArgs } from '../common';

export interface IIntegrationAdapter {
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

export async function assetTransferArgs(
  adapter: IIntegrationAdapter,
  selector: ethers.utils.BytesLike,
  encodedCallArgs: ethers.utils.BytesLike,
) {
  const {
    spendAssets_,
    spendAssetAmounts_,
    incomingAssets_,
  } = await adapter.parseAssetsForMethod(selector, encodedCallArgs);
  console.log('spendAssets_', spendAssets_);
  console.log('spendAssetAmounts_', spendAssetAmounts_);
  console.log('incomingAssets_', incomingAssets_);

  return encodeArgs(
    ['address[]', 'uint[]', 'address[]'],
    [spendAssets_, spendAssetAmounts_, incomingAssets_],
  );
}

export function kyberTakeOrder(
  incomingAsset: string,
  expectedIncomingAssetAmount: ethers.BigNumberish,
  outgoingAsset: string,
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
