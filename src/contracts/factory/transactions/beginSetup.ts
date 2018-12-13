import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';
import {
  transactionFactory,
  PostProcessFunction,
  PrepareArgsFunction,
  GuardFunction,
} from '~/utils/solidity/transactionFactory';
import { managersToHubs } from '~/contracts/factory/calls/managersToHubs';
import { Contracts } from '~/Contracts';
import { BigInteger } from '@melonproject/token-math/bigInteger';

export interface ExchangeConfig {
  name: string;
  exchangeAddress: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}

export interface FeeConfig {
  feeAddress: Address;
  feeRate: BigInteger;
  feePeriod: BigInteger;
}

interface BeginSetupArgs {
  fundName: string;
  fees: FeeConfig[];
  exchangeConfigs: ExchangeConfig[];
  quoteToken: TokenInterface;
  nativeToken: TokenInterface;
  defaultTokens: TokenInterface[];
  priceSource: Address;
}

type BeginSetupResult = string;

const guard: GuardFunction<BeginSetupArgs> = async (
  environment,
  contractAddress,
  params,
) => {};

const prepareArgs: PrepareArgsFunction<BeginSetupArgs> = async (
  _,
  {
    fundName,
    fees,
    exchangeConfigs,
    quoteToken,
    nativeToken,
    defaultTokens,
    priceSource,
  },
  contractAddress,
) => {
  const exchangeAddresses = exchangeConfigs.map(e =>
    e.exchangeAddress.toString(),
  );
  const adapterAddresses = exchangeConfigs.map(e =>
    e.adapterAddress.toString(),
  );
  const takesCustody = exchangeConfigs.map(e => e.takesCustody);
  const defaultTokenAddresses = defaultTokens.map(t => t.address);
  const quoteTokenAddress = quoteToken.address;
  const nativeTokenAddress = nativeToken.address;
  const feeAddresses = fees.map(f => f.feeAddress);
  const feeRates = fees.map(f => f.feeRate);
  const feePeriods = fees.map(f => f.feePeriod);

  const args = [
    fundName,
    feeAddresses,
    feeRates,
    feePeriods,
    exchangeAddresses,
    adapterAddresses,
    quoteTokenAddress,
    nativeTokenAddress,
    defaultTokenAddresses,
    takesCustody,
    priceSource.toString(),
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
