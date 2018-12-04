import * as Eth from 'web3-eth';

import { Address } from '@melonproject/token-math/address';
import { UnsignedRawTransaction } from '../solidity/transactionFactory';

export type SignFunction = (
  unsignedTransaction: UnsignedRawTransaction,
  from?: Address,
) => Promise<string>;

// Same as NPM logging levels
export enum LogLevels {
  ERROR,
  WARN,
  INFO,
  VERBOSE,
  DEBUG,
  SILLY,
}

export type LoggerFunction = (
  namespace: string,
  level: LogLevels,
  ...msg: any[]
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
