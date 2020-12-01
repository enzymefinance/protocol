import Decimal from 'decimal.js';
import { BigNumber, utils } from 'ethers';
import { rpow } from '../fees/management';

// GTR_CONSTANT = 1/(1 + r)^(1/N), documentation available at <https://dgld.ch/assets/documents/dgld-whitepaper.pdf>
export async function calcGtrConstant() {
  const annualFee = 0.01;
  // from DGLD docs, anualInflationRate (r) can be calculated as r = 1/(1 - f) - 1 , being f the annual fee
  const annualInflationRate = new Decimal(1).div(new Decimal(1).minus(annualFee)).minus(new Decimal(1));

  const base = new Decimal(1).plus(annualInflationRate);
  const exponent = new Decimal(1).div(new Decimal(365 * 3));

  const totalDiscount = base.pow(exponent).mul(1e18);
  const totalDiscountBn = BigNumber.from(totalDiscount.toFixed(0).toString());

  // 27 decimals GTR constant precision + 18 from division
  const gtrConstant = utils.parseUnits('1', 45).div(totalDiscountBn.toString());
  return gtrConstant;
}

export async function calcGtr({
  currentTimestamp,
  initialTimestamp,
}: {
  currentTimestamp: number;
  initialTimestamp: number;
}) {
  const timeDiff = currentTimestamp - initialTimestamp;
  const effectiveTimeDiff = BigNumber.from(timeDiff);

  const timeMod8h = effectiveTimeDiff.div(BigNumber.from(60 * 60 * 8));

  // Calculate GTR Constant for an 1% fee
  const gtrConstant = await calcGtrConstant();

  // Divide by 10 = multiplying per 0.1
  const gtr = rpow(gtrConstant, timeMod8h, utils.parseUnits('1', 27)).div(10);
  return gtr;
}
