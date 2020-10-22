import { Call, Contract } from '@crestproject/crestproject';
import { BigNumber, BytesLike, utils } from 'ethers';
import { encodeArgs, sighash } from '../../../common';

export enum spendAssetsHandleTypes {
  None,
  Approve,
  Transfer,
}

// prettier-ignore
export interface IntegrationAdapterInterface extends Contract {
  parseAssetsForMethod: Call<(_selector: BytesLike, _encodedCallArgs: BytesLike) => { spendAssets_: string[]; spendAssetAmounts_: BigNumber[]; incomingAssets_: string[]; minIncomingAssetAmounts_: BigNumber[]; }>;
}

export const callOnIntegrationFragment = utils.FunctionFragment.fromString(
  'callOnIntegration(address,bytes)',
);

export const addTrackedAssetsFragment = utils.FunctionFragment.fromString(
  'addTrackedAssets(address,bytes,bytes)',
);

export const lendFragment = utils.FunctionFragment.fromString(
  'lend(address,bytes,bytes)',
);

export const redeemFragment = utils.FunctionFragment.fromString(
  'redeem(address,bytes,bytes)',
);

export const takeOrderFragment = utils.FunctionFragment.fromString(
  'takeOrder(address,bytes,bytes)',
);

export const callOnIntegrationSelector = sighash(callOnIntegrationFragment);

export const addTrackedAssetsSelector = sighash(addTrackedAssetsFragment);

export const takeOrderSelector = sighash(takeOrderFragment);

export const redeemSelector = sighash(redeemFragment);

export const lendSelector = sighash(lendFragment);

export async function assetTransferArgs({
  adapter,
  selector,
  encodedCallArgs,
}: {
  adapter: IntegrationAdapterInterface;
  selector: BytesLike;
  encodedCallArgs: BytesLike;
}) {
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

export function callOnIntegrationArgs({
  adapter,
  selector,
  encodedCallArgs,
}: {
  adapter: IntegrationAdapterInterface;
  selector: BytesLike;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(
    ['address', 'bytes4', 'bytes'],
    [adapter, selector, encodedCallArgs],
  );
}
