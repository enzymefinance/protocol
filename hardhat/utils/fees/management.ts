import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumber, BigNumberish } from 'ethers';
import { constants } from 'ethers';

import { encodeArgs } from '../encoding';
import { calcAmountDueForScaledPerSecondRate, convertRateToScaledPerSecondRate } from '../rates';

export function managementFeeConfigArgs({
  scaledPerSecondRate,
  recipient = constants.AddressZero,
}: {
  scaledPerSecondRate: BigNumberish;
  recipient?: AddressLike;
}) {
  return encodeArgs(['uint256', 'address'], [scaledPerSecondRate, recipient]);
}

export function managementFeeConvertRateToScaledPerSecondRate(rate: BigNumberish): BigNumber {
  return convertRateToScaledPerSecondRate({ rate, adjustInflation: true });
}

export function managementFeeSharesDue({
  scaledPerSecondRate,
  sharesSupply,
  secondsSinceLastSettled,
}: {
  scaledPerSecondRate: BigNumberish;
  sharesSupply: BigNumberish;
  secondsSinceLastSettled: BigNumberish;
}): BigNumber {
  return calcAmountDueForScaledPerSecondRate({
    scaledPerSecondRate,
    totalAmount: sharesSupply,
    secondsSinceLastSettled,
  });
}
