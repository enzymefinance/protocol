import { ethers } from 'ethers';
import { Contract } from 'crestproject';

/**
 * @todo Write this.
 *
 * @param value
 * @param numBytes
 */
export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, numBytes);
};

/**
 * @todo Write this.
 *
 * @param types
 * @param args
 */
export function encodeArgs(
  types: (string | ethers.utils.ParamType)[],
  args: any[],
) {
  const hex = ethers.utils.defaultAbiCoder.encode(types, args);
  return ethers.utils.arrayify(hex);
}

export async function transferToken(
  token: Contract,
  to: string,
  amount: ethers.BigNumberish = ethers.utils.parseEther('1'),
) {
  return (token as any).transfer(to, amount).send();
}

export async function approveToken(
  token: Contract,
  spender: string,
  amount: ethers.BigNumberish = ethers.utils.parseEther('1'),
) {
  return (token as any).approve(spender, amount).send();
}

export function randomAddress() {
  const address = ethers.utils.hexlify(ethers.utils.randomBytes(20));
  return ethers.utils.getAddress(address);
}
