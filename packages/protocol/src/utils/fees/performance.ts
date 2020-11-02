import { BigNumber, BigNumberish, utils } from 'ethers';
import { max } from '../bignumber';
import { encodeArgs } from '../encoding';
import { sharesDueWithInflation } from './settlement';
import { FeeHook } from './types';

export function performanceFeeConfigArgs({ rate, period }: { rate: BigNumberish; period: BigNumberish }) {
  return encodeArgs(['uint256', 'uint256'], [rate, period]);
}

export interface PerformanceFeeSharesDueInfo {
  sharesDue: BigNumber;
  nextAggregateValueDue: BigNumber;
  nextSharePrice: BigNumber;
}

// TODO: Split this up into separate functions based on the fee hook to
// get correct typescript type coverage.
export function performanceFeeSharesDue({
  rate,
  totalSharesSupply,
  sharesOutstanding,
  gav,
  highWaterMark,
  prevSharePrice,
  prevAggregateValueDue,
  denominationAssetDecimals = 18,
  feeHook = FeeHook.Continuous,
  settlementInfo,
}: {
  rate: BigNumberish;
  totalSharesSupply: BigNumberish;
  sharesOutstanding: BigNumberish;
  gav: BigNumberish;
  highWaterMark: BigNumberish;
  prevSharePrice: BigNumberish;
  prevAggregateValueDue: BigNumberish;
  denominationAssetDecimals?: BigNumberish;
  feeHook?: FeeHook;
  settlementInfo?: {
    buySharesInvestmentAmount?: BigNumberish;
    redeemSharesSharesAmount?: BigNumberish;
  };
}): PerformanceFeeSharesDueInfo {
  const rateDivisor = utils.parseEther('1');
  const shareUnit = utils.parseEther('1');
  const netSharesSupply = BigNumber.from(totalSharesSupply).sub(sharesOutstanding);

  const sharePriceWithoutPerformance = BigNumber.from(gav).mul(shareUnit).div(netSharesSupply);

  // Accrued value
  const superHWMValueSinceLastSettled = max(highWaterMark, sharePriceWithoutPerformance)
    .sub(max(highWaterMark, prevSharePrice))
    .mul(netSharesSupply)
    .div(shareUnit);

  const valueDueSinceLastSettled = superHWMValueSinceLastSettled.mul(rate).div(rateDivisor);

  const nextAggregateValueDue = max(0, valueDueSinceLastSettled.add(prevAggregateValueDue));

  // Shares due
  const sharesDueForAggregateValueDue = sharesDueWithInflation({
    rawSharesDue: nextAggregateValueDue.mul(netSharesSupply).div(gav),
    sharesSupply: netSharesSupply,
  });

  const sharesDue = BigNumber.from(sharesDueForAggregateValueDue).sub(sharesOutstanding);

  // Next share price
  let nextSharePrice = BigNumber.from(0);
  if (feeHook === FeeHook.Continuous) {
    nextSharePrice = sharePriceWithoutPerformance;
  } else {
    const sharesSupplyWithSharesDue = sharesDue.add(totalSharesSupply);
    const denominationAssetUnit = BigNumber.from(10).pow(denominationAssetDecimals);

    let nextNetSharesSupply = BigNumber.from(0);
    let nextGav = BigNumber.from(0);

    if (feeHook == FeeHook.PreBuyShares) {
      const gavIncrease = settlementInfo!.buySharesInvestmentAmount!;
      nextGav = BigNumber.from(gav).add(gavIncrease);

      const sharesIncrease = BigNumber.from(gavIncrease)
        .mul(denominationAssetUnit)
        .mul(sharesSupplyWithSharesDue)
        .div(gav)
        .div(shareUnit);

      nextNetSharesSupply = netSharesSupply.add(sharesIncrease);
    } else if (feeHook == FeeHook.PreRedeemShares) {
      const sharesDecrease = settlementInfo!.redeemSharesSharesAmount!;
      nextNetSharesSupply = netSharesSupply.sub(sharesDecrease);

      const gavDecrease = BigNumber.from(sharesDecrease)
        .mul(gav)
        .mul(shareUnit)
        .div(sharesSupplyWithSharesDue)
        .div(denominationAssetUnit);

      nextGav = BigNumber.from(gav).sub(gavDecrease);
    } else {
      throw new Error('Invalid fee hook');
    }

    nextSharePrice = nextGav.mul(shareUnit).div(nextNetSharesSupply);
  }

  return {
    sharesDue,
    nextAggregateValueDue,
    nextSharePrice,
  };
}
