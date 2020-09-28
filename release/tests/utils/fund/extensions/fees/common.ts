import { AddressLike } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, utils } from 'ethers';
import { encodeArgs, sighash } from '../../../common';

export const feeHooks = {
  None: 0,
  BuyShares: 1,
  Continuous: 2,
};

export const feeSettlementTypes = {
  None: 0,
  Direct: 1,
  Mint: 2,
  MintSharesOutstanding: 3,
  BurnSharesOutstanding: 4,
};

export function settleBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  sharesBought: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, sharesBought],
  );
}

export function sharesDueWithInflation({
  rawSharesDue,
  sharesSupply,
}: {
  rawSharesDue: BigNumber;
  sharesSupply: BigNumber;
}) {
  if (rawSharesDue == BigNumber.from(0) || sharesSupply == BigNumber.from(0)) {
    return 0;
  }

  return rawSharesDue.mul(sharesSupply).div(sharesSupply.sub(rawSharesDue));
}

export const settleContinuousFeesFragment = utils.FunctionFragment.fromString(
  'settleContinuousFees(address,bytes)',
);
export const settleContinuousFeesSelector = sighash(
  settleContinuousFeesFragment,
);
