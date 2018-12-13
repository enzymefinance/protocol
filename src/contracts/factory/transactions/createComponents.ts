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

interface CreateComponentsArgs {
  fundName: string;
  fees: FeeConfig[];
  exchangeConfigs: ExchangeConfigs;
  quoteToken: TokenInterface;
  nativeToken: TokenInterface;
  defaultTokens: TokenInterface[];
  priceSource: Address;
}

type CreateComponentsResult = string;

const guard: GuardFunction<CreateComponentsArgs> = async (
  environment,
  contractAddress,
  params,
) => {
  // createComponents
};

const prepareArgs: PrepareArgsFunction<CreateComponentsArgs> = async (
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

  const args = [
    fundName,
    fees,
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
  CreateComponentsArgs,
  CreateComponentsResult
> = async (environment, receipt, params, contractAddress) => {
  return managersToHubs(
    environment,
    contractAddress,
    environment.wallet.address,
  );
};

export const createComponents = transactionFactory<
  CreateComponentsArgs,
  CreateComponentsResult
>('createComponents', Contracts.FundFactory, guard, prepareArgs, postProcess, {
  amguPayable: true,
});
