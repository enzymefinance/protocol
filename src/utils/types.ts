import { isAddress } from './checks/isAddress';
import * as Web3Utils from 'web3-utils';

export interface Signature {
  r: string;
  s: string;
  v: string;
}

/**
 * Dummy classes to achieve typesafety.
 * DO NOT ADD METHODS
 */
export class Address extends String {
  constructor(address: string) {
    if (!isAddress(address)) {
      throw new TypeError(`Invalid address ${address}`);
    }

    super(Web3Utils.toChecksumAddress(address));
  }
}

export class ContractAddress extends Address {}
