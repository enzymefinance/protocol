import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export function aaveV2LendArgs({ aToken, amount }: { aToken: AddressLike; amount: BigNumberish }) {
  return encodeArgs(['address', 'uint256'], [aToken, amount]);
}

export function aaveV2RedeemArgs({ aToken, amount }: { aToken: AddressLike; amount: BigNumberish }) {
  return encodeArgs(['address', 'uint256'], [aToken, amount]);
}
