import { Address, BigInteger, TokenInterface } from '@melonproject/token-math';

import {
  transactionFactory,
  PostProcessFunction,
  PrepareArgsFunction,
  GuardFunction,
} from '~/utils/solidity/transactionFactory';
import { managersToHubs } from '~/contracts/factory/calls/managersToHubs';
import { Contracts } from '~/Contracts';
import { stringToBytes32 } from '~/utils/helpers/stringToBytes32';

// import ensure from '~/utils/guards/ensure';

export interface ExchangeConfigs {
  [exchange: string]: {
    exchange: Address;
    adapter: Address;
    takesCustody: boolean;
  };
}

export interface FeeConfig {
  feeAddress: Address;
  feeRate: BigInteger;
  feePeriod: BigInteger;
}

interface BeginSetupArgs {
  fundName: string;
  fees: FeeConfig[];
  exchangeConfigs: ExchangeConfigs;
  quoteToken: TokenInterface;
  nativeToken: TokenInterface;
  defaultTokens: TokenInterface[];
}

type BeginSetupResult = string;

const guard: GuardFunction<BeginSetupArgs> = async (
  environment,
  contractAddress,
  params,
) => {};

const prepareArgs: PrepareArgsFunction<BeginSetupArgs> = async (
  _,
  { fundName, fees, exchangeConfigs, quoteToken, nativeToken, defaultTokens },
) => {
  const exchangeAddresses = Object.values(exchangeConfigs).map(e =>
    e.exchange.toString(),
  );
  const adapterAddresses = Object.values(exchangeConfigs).map(e =>
    e.adapter.toString(),
  );
  const takesCustody = Object.values(exchangeConfigs).map(e => e.takesCustody);
  const defaultTokenAddresses = defaultTokens.map(t => t.address);
  const quoteTokenAddress = quoteToken.address;
  const nativeTokenAddress = nativeToken.address;
  const feeAddresses = fees.map(f => f.feeAddress);
  // TODO: Hacky fix. Could be some problem with BN.js
  const feeRates = fees.map(f => `${f.feeRate}`);
  const feePeriods = fees.map(f => `${f.feePeriod}`);

  const args = [
    stringToBytes32(fundName),
    feeAddresses,
    feeRates,
    feePeriods,
    exchangeAddresses,
    adapterAddresses,
    quoteTokenAddress,
    nativeTokenAddress,
    defaultTokenAddresses,
    takesCustody,
  ];

  return args;
};

const postProcess: PostProcessFunction<
  BeginSetupArgs,
  BeginSetupResult
> = async (environment, receipt, params, contractAddress) => {
  return managersToHubs(
    environment,
    contractAddress,
    environment.wallet.address,
  );
};

export const beginSetup = transactionFactory<BeginSetupArgs, BeginSetupResult>(
  'beginSetup',
  Contracts.FundFactory,
  guard,
  prepareArgs,
  postProcess,
);
