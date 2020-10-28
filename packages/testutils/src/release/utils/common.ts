import { utils, BigNumber, BigNumberish } from 'ethers';
import { AddressLike, resolveArguments } from '@crestproject/crestproject';
import { StandardToken } from '@melonproject/protocol';

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

export function bigNumberMax(values: BigNumberish[]) {
  let max = BigNumber.from(0);
  for (const value of values) {
    const bnValue = BigNumber.from(value);
    if (bnValue.gt(max)) {
      max = bnValue;
    }
  }
  return max;
}

export async function getAssetBalances({
  account,
  assets,
}: {
  account: AddressLike;
  assets: StandardToken[];
}) {
  return Promise.all<any>(assets.map((asset) => asset.balanceOf(account)));
}
