import { BigNumber, BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../../../common';
import { sharesDueWithInflation } from './common';

export async function managementFeeConfigArgs(rate: BigNumberish) {
  return encodeArgs(['uint256'], [rate]);
}

export function managementFeeSharesDue({
  rate,
  sharesSupply,
  secondsSinceLastSettled,
}: {
  rate: BigNumber;
  sharesSupply: BigNumber;
  secondsSinceLastSettled: BigNumber;
}) {
  const yearlyRawSharesDue = BigNumber.from(sharesSupply)
    .mul(rate)
    .div(utils.parseEther('1'));

  const rawSharesDue = yearlyRawSharesDue
    .mul(secondsSinceLastSettled)
    .div(60 * 60 * 24 * 365);

  return sharesDueWithInflation({
    rawSharesDue,
    sharesSupply,
  });
}
