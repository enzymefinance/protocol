import { BigNumber, BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../encoding';

export function entranceRateFeeConfigArgs(rate: BigNumberish) {
  return encodeArgs(['uint256'], [rate]);
}

export function entranceRateFeeSharesDue({ rate, sharesBought }: { rate: BigNumberish; sharesBought: BigNumberish }) {
  return BigNumber.from(sharesBought).mul(rate).div(utils.parseEther('1').add(rate));
}
