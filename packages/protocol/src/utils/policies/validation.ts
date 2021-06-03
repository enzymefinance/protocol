import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function validateRuleAddTrackedAssetsArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
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

export function validateRulePostCoIArgs({
  adapter,
  selector,
  incomingAssets,
  incomingAssetAmounts,
  outgoingAssets,
  outgoingAssetAmounts,
}: {
  adapter: AddressLike;
  selector: BytesLike;
  incomingAssets: AddressLike[];
  incomingAssetAmounts: BigNumberish[];
  outgoingAssets: AddressLike[];
  outgoingAssetAmounts: BigNumberish[];
}) {
  return encodeArgs(
    ['address', 'bytes4', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [adapter, selector, incomingAssets, incomingAssetAmounts, outgoingAssets, outgoingAssetAmounts],
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
