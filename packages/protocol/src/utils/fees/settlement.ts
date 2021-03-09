import { AddressLike } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export function settlePreBuySharesArgs({
  buyer,
  investmentAmount,
  minSharesQuantity,
}: {
  buyer: AddressLike;
  investmentAmount: BigNumberish;
  minSharesQuantity: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256', 'uint256'], [buyer, investmentAmount, minSharesQuantity]);
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
