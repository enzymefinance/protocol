import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

export function max(first: BigNumberish, ...values: BigNumberish[]) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (values ?? []).reduce((carry: BigNumber, current) => {
    if (carry.gte(current)) {
      return carry;
    }

    return BigNumber.from(current);
  }, BigNumber.from(first));
}

export function min(first: BigNumberish, ...values: BigNumberish[]) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (values ?? []).reduce((carry: BigNumber, current) => {
    if (carry.lte(current)) {
      return carry;
    }

    return BigNumber.from(current);
  }, BigNumber.from(first));
}
