import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export function olympusV2StakeArgs({ amount }: { amount: BigNumberish }) {
  return encodeArgs(['uint256'], [amount]);
}

export function olympusV2UnstakeArgs({ amount }: { amount: BigNumberish }) {
  return encodeArgs(['uint256'], [amount]);
}
