import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function engineTakeOrderArgs({
  minWethAmount,
  mlnAmount,
}: {
  minWethAmount: BigNumberish;
  mlnAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [minWethAmount, mlnAmount]);
}
