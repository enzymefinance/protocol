import { BigNumber, BigNumberish } from 'ethers';

export function max(first: BigNumberish, ...values: BigNumberish[]) {
  return (values ?? []).reduce((carry: BigNumber, current) => {
    if (carry.gte(current)) {
      return carry;
    }

    return BigNumber.from(current);
  }, BigNumber.from(first));
}

export function min(first: BigNumberish, ...values: BigNumberish[]) {
  return (values ?? []).reduce((carry: BigNumber, current) => {
    if (carry.lte(current)) {
      return carry;
    }

    return BigNumber.from(current);
  }, BigNumber.from(first));
}
