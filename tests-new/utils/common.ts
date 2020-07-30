import { resolveArguments } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { ParamType } from 'ethers/lib/utils';

export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, numBytes);
};

export async function encodeArgs(
  types: (string | ethers.utils.ParamType)[],
  args: any[],
) {
  const params = types.map((type) => ParamType.from(type));
  const resolved = await resolveArguments(params, args);
  const hex = ethers.utils.defaultAbiCoder.encode(params, resolved);
  return ethers.utils.arrayify(hex);
}

export function randomAddress() {
  const address = ethers.utils.hexlify(ethers.utils.randomBytes(20));
  return ethers.utils.getAddress(address);
}
