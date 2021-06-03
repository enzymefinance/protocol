import { AddressLike } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function uniswapV3TakeOrderArgs({
  pathAddresses,
  pathFees,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  pathAddresses: AddressLike[];
  pathFees: BigNumber[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address[]', 'uint24[]', 'uint256', 'uint256'],
    [pathAddresses, pathFees, outgoingAssetAmount, minIncomingAssetAmount],
  );
}
