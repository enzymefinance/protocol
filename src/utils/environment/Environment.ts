import * as Eth from 'web3-eth';
import { Address } from '@melonproject/token-math/address';
import { UnsignedRawTransaction } from '~/utils/solidity/transactionFactory';
import { MelonContracts, MelonContractsDraft } from '../deploy/deploySystem';
import { ThirdPartyContracts } from '../deploy/deployThirdParty';
import { ExchangeConfigs } from '~/contracts/factory/transactions/beginSetup';

// Note: The
export type SignTransactionFunction = (
  unsignedTransaction: UnsignedRawTransaction,
  from?: Address,
) => Promise<string>;

export type SignMessageFunction = (
  message: string,
  from?: Address,
) => Promise<string>;

export enum Tracks {
  // Track for testing with our own testing price feed
  TESTING = 'testing',
  // Track linked to the kyber price feed
  KYBER_PRICE = 'kyberPrice',
}

// Subset of NPM logging levels without numbers
export enum LogLevels {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export type LoggerFunction = (...messages: any) => void;

export type LoggerFunctionWithLevel = {
  (level: LogLevels): LoggerFunction;
  (level: LogLevels, message: any, ...messages: any): void;
};

export type CurriedLogger = {
  (namespace: string, level: LogLevels, message: any, ...messages: any): void;
  (namespace: string, level: LogLevels): LoggerFunction;
  (namespace: string): LoggerFunctionWithLevel;
};

export interface Wallet {
  // TODO: Rename this to currentAccount
  address: Address;
  signTransaction?: SignTransactionFunction;
  signMessage?: SignMessageFunction;
}

export interface Options {
  readonly gasLimit: string;
  readonly gasPrice: string;
}

export interface DeployMeta {
  deployer: Address;
  timestamp: string;
  track: Tracks;
  version: string;
  chain: number;
  description?: string;
}

export interface Deployment {
  meta: DeployMeta;
  exchangeConfigs: ExchangeConfigs;
  melonContracts: MelonContracts;
  thirdPartyContracts: ThirdPartyContracts;
}

export interface PartialDeployment {
  meta?: DeployMeta;
  exchangeConfigs?: ExchangeConfigs;
  thirdPartyContracts?: Partial<ThirdPartyContracts>;
  melonContracts?: MelonContractsDraft;
}

export interface Environment {
  readonly eth: Eth;
  readonly track: Tracks;
  readonly wallet?: Wallet;
  readonly options: Options;
  readonly logger: CurriedLogger;
  readonly deployment?: PartialDeployment;
}

export interface WithDeployment extends Environment {
  readonly deployment: Deployment;
}

export interface WithWallet extends Environment {
  readonly wallet: Wallet;
}

export interface WithWalletAndDeployment extends Environment {
  readonly deployment: Deployment;
  readonly wallet: Wallet;
}
