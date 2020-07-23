import { ethers } from 'ethers';
import { encodeArgs } from '../common';

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
