import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function validateRulePreBuySharesArgs({
  buyer,
  investmentAmount,
  minSharesQuantity,
  fundGav,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
  minSharesQuantity: BigNumberish;
  fundGav: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'uint256'],
    [buyer, investmentAmount, minSharesQuantity, fundGav],
  );
}

export function validateRulePostBuySharesArgs({
  buyer,
  investmentAmount,
  sharesBought,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
  sharesBought: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, sharesBought],
  );
}

export function validateRulePreCoIArgs({
  adapter,
  selector,
}: {
  adapter: AddressLike;
  selector: BytesLike;
}) {
  return encodeArgs(['address', 'bytes4'], [adapter, selector]);
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
    [
      adapter,
      selector,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets,
      outgoingAssetAmounts,
    ],
  );
}
