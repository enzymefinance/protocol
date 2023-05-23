import type { Wallet } from 'ethers';
import { Signer, utils } from 'ethers';

import { Contract } from '../contract';
import type { AddressLike } from '../types';

export function resolveAddress(value: AddressLike): string {
  if (typeof value === 'string') {
    return utils.getAddress(value);
  }

  if (Contract.isContract(value)) {
    return resolveAddress(value.address);
  }

  if (Signer.isSigner(value) && (value as Wallet).address) {
    return resolveAddress((value as Wallet).address);
  }

  if (typeof value === 'object' && typeof value.address === 'string') {
    return utils.getAddress(value.address);
  }

  throw new Error('Failed to resolve address');
}
