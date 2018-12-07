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
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { BigInteger } from '@melonproject/token-math/bigInteger';

// import ensure from '~/utils/guards/ensure';

interface ExchangeConfig {
  exchangeAddress: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}
export interface FeeConfig {
  feeAddress: Address;
  feeRate: BigInteger;
  feePeriod: BigInteger;
}

interface CreateComponentsArgs {
  fundName: string;
  fees: FeeConfig[];
  exchangeConfigs: ExchangeConfig[];
  quoteToken: TokenInterface;
  nativeToken: TokenInterface;
  defaultTokens: TokenInterface[];
  priceSource: Address;
}

type CreateComponentsResult = string;

const guard: GuardFunction<CreateComponentsArgs> = async (
  contractAddress,
  params,
  environment,
) => {
  // createComponents
};

const prepareArgs: PrepareArgsFunction<CreateComponentsArgs> = async (
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
> = async (
  receipt,
  params,
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  return managersToHubs(
    contractAddress,
    environment.wallet.address,
    environment,
  );
};

export const createComponents = transactionFactory<
  CreateComponentsArgs,
  CreateComponentsResult
>('createComponents', Contracts.FundFactory, guard, prepareArgs, postProcess, {
  amguPayable: true,
});
