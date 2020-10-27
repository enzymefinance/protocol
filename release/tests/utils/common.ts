import { AddressLike } from '@crestproject/crestproject';
import { StandardToken } from '@melonproject/utils';
import { BigNumber, BigNumberish } from 'ethers';

// TODO: Remove re-exports.
export {
  encodeFunctionData,
  encodeArgsSync,
  encodeArgs,
  sighash,
} from '../../utils/common';

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
