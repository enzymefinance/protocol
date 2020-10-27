import { resolveArguments } from '@crestproject/crestproject';
import { utils } from 'ethers';

export async function encodeArgs(
  types: (string | utils.ParamType)[],
  args: any[],
) {
  const params = types.map((type) => utils.ParamType.from(type));
  const resolved = await resolveArguments(params, args);
  const hex = utils.defaultAbiCoder.encode(params, resolved);
  return utils.arrayify(hex);
}

export function encodeArgsSync(
  types: (string | utils.ParamType)[],
  args: any[],
) {
  const params = types.map((type) => utils.ParamType.from(type));
  const hex = utils.defaultAbiCoder.encode(params, args);
  return utils.arrayify(hex);
}

export function encodeFunctionData(
  fragment: utils.FunctionFragment,
  args: any[] = [],
) {
  const encodedArgs = encodeArgsSync(fragment.inputs, args);
  return utils.hexlify(utils.concat([sighash(fragment), encodedArgs]));
}

export function sighash(fragment: utils.FunctionFragment) {
  return utils.hexDataSlice(utils.id(fragment.format()), 0, 4);
}
