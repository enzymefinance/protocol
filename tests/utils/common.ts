import { resolveArguments } from '@crestproject/crestproject';
import { utils } from 'ethers';

export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return utils.hexZeroPad(prefixed, numBytes);
};

export async function encodeArgs(
  types: (string | utils.ParamType)[],
  args: any[],
) {
  const params = types.map((type) => utils.ParamType.from(type));
  const resolved = await resolveArguments(params, args);
  const hex = utils.defaultAbiCoder.encode(params, resolved);
  return utils.arrayify(hex);
}

export function sighash(fragment: utils.FunctionFragment) {
  return utils.hexDataSlice(utils.id(fragment.format()), 0, 4);
}
