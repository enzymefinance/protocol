import { ethers } from 'ethers';

export function stringToBytes(value: string, length: number = 32) {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, length);
}
