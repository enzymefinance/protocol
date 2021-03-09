import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

// Note: arguments are valid for both Lend and Redeem functions
export function compoundArgs({
  cToken,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  cToken: AddressLike;
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256', 'uint256'], [cToken, outgoingAssetAmount, minIncomingAssetAmount]);
}
