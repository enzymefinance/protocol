import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export function settlePreBuySharesArgs({
  buyer,
  investmentAmount,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [buyer, investmentAmount]);
}

export function settlePostBuySharesArgs({
  buyer,
  investmentAmount,
  sharesBought,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
  sharesBought: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256', 'uint256'], [buyer, investmentAmount, sharesBought]);
}

export function settlePreRedeemSharesArgs({
  redeemer,
  sharesToRedeem,
  forSpecifiedAssets,
}: {
  redeemer: AddressLike;
  sharesToRedeem: BigNumberish;
  forSpecifiedAssets: boolean;
}) {
  return encodeArgs(['address', 'uint256', 'bool'], [redeemer, sharesToRedeem, forSpecifiedAssets]);
}

export const settleContinuousFeesFragment = utils.FunctionFragment.fromString('settleContinuousFees(address,bytes)');

export const settleContinuousFeesSelector = sighash(settleContinuousFeesFragment);

export function sharesDueWithInflation({
  rawSharesDue,
  sharesSupply,
}: {
  rawSharesDue: BigNumberish;
  sharesSupply: BigNumberish;
}) {
  if (constants.One.eq(rawSharesDue) || constants.One.eq(sharesSupply)) {
    return constants.One;
  }

  const sharesSupplyBn = BigNumber.from(sharesSupply);
  const rawSharesDueBn = BigNumber.from(rawSharesDue);

  return rawSharesDueBn.mul(sharesSupplyBn).div(sharesSupplyBn.sub(rawSharesDueBn));
}
