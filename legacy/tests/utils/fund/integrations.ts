import { AddressLike, Call, Contract } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, BytesLike, utils } from 'ethers';
import { encodeArgs, sighash } from '../common';

// prettier-ignore
export interface IntegrationAdapterInterface extends Contract {
  parseAssetsForMethod: Call<(_selector: BytesLike, _encodedCallArgs: BytesLike) => { spendAssets_: string[]; spendAssetAmounts_: BigNumber[]; incomingAssets_: string[]; minIncomingAssetAmounts_: BigNumber[]; }>;
}

export const lendFragment = utils.FunctionFragment.fromString(
  'lend(bytes,bytes)',
);

export const redeemFragment = utils.FunctionFragment.fromString(
  'redeem(bytes,bytes)',
);

export const takeOrderFragment = utils.FunctionFragment.fromString(
  'takeOrder(bytes,bytes)',
);

export const takeOrderSignature = takeOrderFragment.format();
export const takeOrderSelector = sighash(takeOrderFragment);

export const redeemSignature = redeemFragment.format();
export const redeemSelector = sighash(redeemFragment);

export const lendSignature = lendFragment.format();
export const lendSelector = sighash(lendFragment);

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

export async function chaiLendArgs(
  outgoingDaiAmount: BigNumberish,
  expectedIncomingChaiAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [outgoingDaiAmount, expectedIncomingChaiAmount],
  );
}

export async function chaiRedeemArgs(
  outgoingChaiAmount: BigNumberish,
  expectedIncomingDaiAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [outgoingChaiAmount, expectedIncomingDaiAmount],
  );
}

export async function engineTakeOrderArgs(
  minNativeAssetAmount: BigNumberish,
  mlnTokenAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [minNativeAssetAmount, mlnTokenAmount],
  );
}
