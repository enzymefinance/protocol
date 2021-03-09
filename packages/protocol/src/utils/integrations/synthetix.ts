import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export const synthetixAssignExchangeDelegateSelector = sighash(
  utils.FunctionFragment.fromString('approveExchangeOnBehalf(address)'),
);

export function synthetixTakeOrderArgs({
  incomingAsset,
  minIncomingAssetAmount,
  outgoingAsset,
  outgoingAssetAmount,
}: {
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount],
  );
}
