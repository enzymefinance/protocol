import * as Eth from 'web3-eth';

import { Address } from '@melonproject/token-math/address';
import { UnsignedRawTransaction } from '../solidity/transactionFactory';

export type SignFunction = (
  unsignedTransaction: UnsignedRawTransaction,
  from?: Address,
) => Promise<string>;

// Subset of NPM logging levels without numbers
export enum LogLevels {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export type LoggerFunction = (
  message: string | any[],
  level?: LogLevels,
  namespace?: string,
) => void;

export interface Wallet {
  // TODO: Rename this to currentAccount
  address: Address;
  sign?: SignFunction;
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
  readonly logger: LoggerFunction;
}
