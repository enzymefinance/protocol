import { BigNumber, BigNumberish, utils } from 'ethers';
import { bigNumberMax, encodeArgs } from '../../../common';
import { feeHooks, sharesDueWithInflation } from './common';

export async function performanceFeeConfigArgs({
  rate,
  period,
}: {
  rate: BigNumberish;
  period: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [rate, period]);
}

export function performanceFeeSharesDue({
  rate,
  totalSharesSupply,
  sharesOutstanding,
  gav,
  highWaterMark,
  prevSharePrice,
  prevAggregateValueDue,
  denominationAssetDecimals = 18,
  feeHook = feeHooks.Continuous,
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
  feeHook?: feeHooks;
  settlementInfo?: {
    buySharesInvestmentAmount?: BigNumberish;
    redeemSharesSharesAmount?: BigNumberish;
  };
}) {
  const rateDivisor = utils.parseEther('1');
  const shareUnit = utils.parseEther('1');
  const netSharesSupply = BigNumber.from(totalSharesSupply).sub(
    sharesOutstanding,
  );
  const sharePriceWithoutPerformance = BigNumber.from(gav)
    .mul(shareUnit)
    .div(netSharesSupply);

  // Accrued value
  const superHWMValueSinceLastSettled = bigNumberMax([
    highWaterMark,
    sharePriceWithoutPerformance,
  ])
    .sub(bigNumberMax([highWaterMark, prevSharePrice]))
    .mul(netSharesSupply)
    .div(shareUnit);
  const valueDueSinceLastSettled = superHWMValueSinceLastSettled
    .mul(rate)
    .div(rateDivisor);
  const nextAggregateValueDue = bigNumberMax([
    0,
    valueDueSinceLastSettled.add(prevAggregateValueDue),
  ]);

  // Shares due
  const sharesDueForAggregateValueDue = sharesDueWithInflation({
    rawSharesDue: nextAggregateValueDue.mul(netSharesSupply).div(gav),
    sharesSupply: netSharesSupply,
  });
  const sharesDue = BigNumber.from(sharesDueForAggregateValueDue).sub(
    sharesOutstanding,
  );

  // Next share price
  let nextSharePrice = BigNumber.from(0);
  if (feeHook == feeHooks.Continuous) {
    nextSharePrice = sharePriceWithoutPerformance;
  } else {
    const sharesSupplyWithSharesDue = sharesDue.add(totalSharesSupply);
    const denominationAssetUnit = BigNumber.from(10).pow(
      denominationAssetDecimals,
    );
    let nextNetSharesSupply = BigNumber.from(0);
    let nextGav = BigNumber.from(0);

    if (feeHook == feeHooks.PreBuyShares) {
      const gavIncrease = settlementInfo!.buySharesInvestmentAmount!;
      nextGav = BigNumber.from(gav).add(gavIncrease);

      const sharesIncrease = BigNumber.from(gavIncrease)
        .mul(denominationAssetUnit)
        .mul(sharesSupplyWithSharesDue)
        .div(gav)
        .div(shareUnit);
      nextNetSharesSupply = netSharesSupply.add(sharesIncrease);
    } else if (feeHook == feeHooks.PreRedeemShares) {
      const sharesDecrease = settlementInfo!.redeemSharesSharesAmount!;
      nextNetSharesSupply = netSharesSupply.sub(sharesDecrease);

      const gavDecrease = BigNumber.from(sharesDecrease)
        .mul(gav)
        .mul(shareUnit)
        .div(sharesSupplyWithSharesDue)
        .div(denominationAssetUnit);
      nextGav = BigNumber.from(gav).sub(gavDecrease);
    } else {
      throw 'No valid feeHook passed';
    }

    nextSharePrice = nextGav.mul(shareUnit).div(nextNetSharesSupply);
  }

  return {
    sharesDue,
    nextAggregateValueDue,
    nextSharePrice,
  };
}
