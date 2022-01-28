import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';
import { constants } from 'ethers';

import { encodeArgs } from '../encoding';

export function performanceFeeConfigArgs({
  rate,
  recipient = constants.AddressZero,
}: {
  rate: BigNumberish;
  recipient?: AddressLike;
}) {
  return encodeArgs(['uint256', 'address'], [rate, recipient]);
}
