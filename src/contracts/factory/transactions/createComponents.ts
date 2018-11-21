import { TokenInterface } from '@melonproject/token-math/token';

import { Address } from '~/utils/types';
import { transactionFactory, EnhancedExecute } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

// import ensure from '~/utils/guards/ensure';

interface ExchangeConfig {
  exchangeAddress: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}

interface CreateComponentsArgs {
  fundName: string;
  exchangeConfigs: ExchangeConfig[];
  quoteToken: TokenInterface;
  defaultTokens: TokenInterface[];
  priceSource: Address;
}

interface CreateComponentsResult {
  success: boolean;
}

const guard = async (contractAddress: string, params, environment) => {
  // createComponents
};

const prepareArgs = async (
  { fundName, exchangeConfigs, quoteToken, defaultTokens, priceSource },
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

  const args = [
    fundName,
    exchangeAddresses,
    adapterAddresses,
    quoteTokenAddress,
    defaultTokenAddresses,
    takesCustody,
    priceSource.toString(),
  ];

  return args;
};

const postProcess = async (receipt, params) => {
  return { success: true };
};

export const createComponents: EnhancedExecute<
  CreateComponentsArgs,
  CreateComponentsResult
> = transactionFactory(
  'createComponents',
  Contracts.FundFactory,
  guard,
  prepareArgs,
  postProcess,
  { amguPayable: true },
);
