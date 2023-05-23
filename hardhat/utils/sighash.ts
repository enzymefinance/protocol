import { utils } from 'ethers';

export function sighash(fragment: utils.FunctionFragment) {
  return utils.hexDataSlice(utils.id(fragment.format()), 0, 4);
}
