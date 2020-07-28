import { ethers } from 'ethers';

export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, numBytes);
};

export function encodeArgs(
  types: (string | ethers.utils.ParamType)[],
  args: any[],
) {
  const hex = ethers.utils.defaultAbiCoder.encode(types, args);
  return ethers.utils.arrayify(hex);
}

export function randomAddress() {
  const address = ethers.utils.hexlify(ethers.utils.randomBytes(20));
  return ethers.utils.getAddress(address);
}
