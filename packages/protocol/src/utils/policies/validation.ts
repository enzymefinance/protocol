import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function validateRuleAddTrackedAssetsArgs({ caller, assets }: { caller: AddressLike; assets: AddressLike[] }) {
  return encodeArgs(['address', 'address[]'], [caller, assets]);
}

export function validateRuleCreateExternalPositionArgs({
  caller,
  typeId,
  initArgs,
}: {
  caller: AddressLike;
  typeId: Number;
  initArgs: BytesLike;
}) {
  return encodeArgs(['address', 'uint256', 'bytes'], [caller, typeId, initArgs]);
}

export function validateRulePostBuySharesArgs({
  buyer,
  investmentAmount,
  sharesIssued,
  fundGav,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
  sharesIssued: BigNumberish;
  fundGav: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256', 'uint256', 'uint256'], [buyer, investmentAmount, sharesIssued, fundGav]);
}

export function validateRulePostCallOnExternalPositionArgs({
  caller,
  externalPosition,
  assetsToTransfer,
  amountsToTransfer,
  assetsToReceive,
  encodedActionData,
}: {
  caller: AddressLike;
  externalPosition: AddressLike;
  assetsToTransfer: AddressLike[];
  amountsToTransfer: BigNumberish[];
  assetsToReceive: AddressLike[];
  encodedActionData: BytesLike;
}) {
  return encodeArgs(
    ['address', 'address', 'address[]', 'uint256[]', 'address[]', 'bytes'],
    [caller, externalPosition, assetsToTransfer, amountsToTransfer, assetsToReceive, encodedActionData],
  );
}

export function validateRulePostCoIArgs({
  caller,
  adapter,
  selector,
  incomingAssets,
  incomingAssetAmounts,
  spendAssets,
  spendAssetAmounts,
}: {
  caller: AddressLike;
  adapter: AddressLike;
  selector: BytesLike;
  incomingAssets: AddressLike[];
  incomingAssetAmounts: BigNumberish[];
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
}) {
  return encodeArgs(
    ['address', 'address', 'bytes4', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [caller, adapter, selector, incomingAssets, incomingAssetAmounts, spendAssets, spendAssetAmounts],
  );
}

export function validateRuleRedeemSharesForSpecificAssetsArgs({
  redeemer,
  recipient,
  sharesToRedeemPostFees,
  assets,
  assetAmounts,
  gavPreRedeem,
}: {
  redeemer: AddressLike;
  recipient: AddressLike;
  sharesToRedeemPostFees: BigNumberish;
  assets: AddressLike[];
  assetAmounts: BigNumberish[];
  gavPreRedeem: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'address[]', 'uint256[]', 'uint256'],
    [redeemer, recipient, sharesToRedeemPostFees, assets, assetAmounts, gavPreRedeem],
  );
}

export function validateRuleRemoveExternalPositionArgs({
  externalPositionProxy,
  caller,
}: {
  externalPositionProxy: AddressLike;
  caller: AddressLike;
}) {
  return encodeArgs(['address', 'address'], [caller, externalPositionProxy]);
}

export function validateRuleReactivateExternalPositionArgs({
  externalPositionProxy,
  caller,
}: {
  externalPositionProxy: AddressLike;
  caller: AddressLike;
}) {
  return encodeArgs(['address', 'address'], [caller, externalPositionProxy]);
}

export function validateRuleRemoveTrackedAssetsArgs({
  caller,
  assets,
}: {
  caller: AddressLike;
  assets: AddressLike[];
}) {
  return encodeArgs(['address', 'address[]'], [caller, assets]);
}
