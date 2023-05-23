import { Decimal } from 'decimal.js';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { ONE_YEAR_IN_SECONDS } from '..';

// Scaled per-second rate

export const scaledPerSecondRateDigits = 27;
export const scaledPerSecondRateScale = BigNumber.from(10).pow(scaledPerSecondRateDigits);
export const scaledPerSecondRateScaleDecimal = new Decimal(scaledPerSecondRateScale.toString());

Decimal.set({ precision: 2 * scaledPerSecondRateDigits });

export function calcAmountDueForScaledPerSecondRate({
  scaledPerSecondRate,
  totalAmount,
  secondsSinceLastSettled,
}: {
  scaledPerSecondRate: BigNumberish;
  totalAmount: BigNumberish;
  secondsSinceLastSettled: BigNumberish;
}) {
  const timeFactor = rpow(scaledPerSecondRate, secondsSinceLastSettled, scaledPerSecondRateScale);

  const amountDue = BigNumber.from(totalAmount)
    .mul(timeFactor.sub(scaledPerSecondRateScale))
    .div(scaledPerSecondRateScale);

  return amountDue;
}

export function convertRateToScaledPerSecondRate({
  rate,
  adjustInflation,
}: {
  rate: BigNumberish;
  adjustInflation: boolean;
}) {
  const rateD = new Decimal(utils.formatEther(rate));
  const effectiveRate = adjustInflation ? rateD.div(new Decimal(1).minus(rateD)) : rateD;

  const factor = new Decimal(1)
    .plus(effectiveRate)
    .pow(1 / ONE_YEAR_IN_SECONDS)
    .toSignificantDigits(scaledPerSecondRateDigits)
    .mul(scaledPerSecondRateScaleDecimal);

  return BigNumber.from(factor.toFixed(0));
}

export function convertScaledPerSecondRateToRate({
  scaledPerSecondRate,
  adjustInflation,
}: {
  scaledPerSecondRate: BigNumberish;
  adjustInflation: boolean;
}) {
  const scaledPerSecondRateD = new Decimal(scaledPerSecondRate.toString()).div(scaledPerSecondRateScaleDecimal);
  const effectiveRate = scaledPerSecondRateD.pow(ONE_YEAR_IN_SECONDS).minus(new Decimal(1));
  const rate = adjustInflation ? effectiveRate.div(new Decimal(1).plus(effectiveRate)) : effectiveRate;

  return utils.parseEther(rate.toFixed(17, Decimal.ROUND_UP));
}

export function rpow(x: BigNumberish, n: BigNumberish, b: BigNumberish) {
  const xD = new Decimal(BigNumber.from(x).toString());
  const bD = new Decimal(BigNumber.from(b).toString());
  const nD = new Decimal(BigNumber.from(n).toString());

  const xDPow = xD.div(bD).pow(nD);

  return BigNumber.from(xDPow.mul(bD).toFixed(0));
}
