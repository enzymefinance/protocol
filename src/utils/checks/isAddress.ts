import { Address } from '@melonproject/token-math/address';
import * as web3Utils from 'web3-utils';

import { ensure } from '~/utils/guards/ensure';

export const isAddress = (address: string | Address): boolean =>
  `${address}`.length === 42 &&
  web3Utils.isAddress(`${address}`) &&
  web3Utils.isHexStrict(`${address}`);

export const ensureAddress = (address: string | Address) =>
  ensure(isAddress(address), `${address} is not a vaild address`, address);
