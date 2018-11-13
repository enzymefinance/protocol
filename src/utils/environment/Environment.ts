import * as Eth from 'web3-eth';

import { Address } from '~/utils/types';

export interface Wallet {
  // TODO: Rename this to currentAccount
  address: Address;
}

export interface Options {
  readonly gasLimit: string;
  readonly gasPrice: string;
}

export interface Environment {
  readonly confirmer?: Function;
  readonly eth: Eth;
  readonly track: string;
  readonly wallet?: Wallet;
  readonly options: Options;
}
