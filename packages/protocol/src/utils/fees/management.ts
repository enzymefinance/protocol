import { Decimal } from 'decimal.js';
import { BigNumber, BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../encoding';

export const managementFeeDigits = 27;
export const managementFeeScale = BigNumber.from(10).pow(managementFeeDigits);
export const managementFeeScaleDecimal = new Decimal(managementFeeScale.toString());
export const secondsPerYear = 365 * 24 * 60 * 60;

Decimal.set({ precision: 2 * managementFeeDigits });

export function managementFeeConfigArgs(scaledPerSecondRate: BigNumberish) {
  return encodeArgs(['uint256'], [scaledPerSecondRate]);
}

export function convertRateToScaledPerSecondRate(rate: BigNumberish) {
  const rateD = new Decimal(utils.formatEther(rate));
  const effectivRate = rateD.div(new Decimal(1).minus(rateD));

  const factor = new Decimal(1)
    .plus(effectivRate)
    .pow(1 / secondsPerYear)
    .toSignificantDigits(managementFeeDigits)
    .mul(managementFeeScaleDecimal);

  return BigNumber.from(factor.toFixed(0));
}

export function convertScaledPerSecondRateToRate(scaledPerSecondRate: BigNumberish) {
  const scaledPerSecondRateD = new Decimal(scaledPerSecondRate.toString()).div(managementFeeScaleDecimal);
  const effectiveRate = scaledPerSecondRateD.pow(secondsPerYear).minus(new Decimal(1));
  const rate = effectiveRate.div(new Decimal(1).plus(effectiveRate));

  return utils.parseEther(rate.toFixed(17, Decimal.ROUND_UP));
}

export function rpow(x: BigNumberish, n: BigNumberish, b: BigNumberish) {
  const xD = new Decimal(BigNumber.from(x).toString());
  const bD = new Decimal(BigNumber.from(b).toString());
  const nD = new Decimal(BigNumber.from(n).toString());

  const xDPow = xD.div(bD).pow(nD);

  return BigNumber.from(xDPow.mul(bD).toFixed(0));
}

export function managementFeeSharesDue({
  scaledPerSecondRate,
  sharesSupply,
  secondsSinceLastSettled,
}: {
  scaledPerSecondRate: BigNumberish;
  sharesSupply: BigNumberish;
  secondsSinceLastSettled: BigNumberish;
}) {
  const timeFactor = rpow(scaledPerSecondRate, secondsSinceLastSettled, managementFeeScale);

  const sharesDue = BigNumber.from(sharesSupply).mul(timeFactor.sub(managementFeeScale)).div(managementFeeScale);

  return sharesDue;
}
