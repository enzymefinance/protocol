import type { Fragment, JsonFragment } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';

export type PossibleInterface = (Fragment | JsonFragment | string)[] | string;

export function ensureInterface(abi: Interface | PossibleInterface) {
  if (Interface.isInterface(abi)) {
    return abi;
  }

  return new Interface(abi);
}
