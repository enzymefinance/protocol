import * as web3Utils from 'web3-utils';

import { ensure } from '../guards';

export const isAddress = (address: string): boolean =>
  address.length === 42 &&
  web3Utils.isAddress(address) &&
  web3Utils.isHexStrict(address);

export const ensureAddress = (address: string) =>
  ensure(isAddress(address), `${address} is not a vaild address`, address);
