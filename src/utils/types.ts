import isAddress from './checks/isAddress';

/**
 * Dummy classes to achieve typesafety.
 * DO NOT ADD METHODS
 */

export class Address extends String {
  constructor(address: string) {
    if (!isAddress(address)) {
      throw new TypeError(`Invalid address ${address}`);
    }

    super(address);
  }
}
