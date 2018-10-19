import { IToken } from '@melonproject/token-math';

import { Address } from '~/utils/types';
import { Contract, transactionFactory } from '~/utils/solidity';

// import ensure from '~/utils/guards/ensure';

interface ExchangeConfig {
  address: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}

interface CreateComponentArgs {
  fundName: string;
  exchangeConfigs: ExchangeConfig[];
  quoteToken: IToken;
  defaultTokens: IToken[];
  priceSource: Address;
}

const guard = async (contractAddress: string, params, environment) => {
  // createComponents
};

const prepareArgs = async (
  { fundName, exchangeConfigs, quoteToken, defaultTokens, priceSource },
  contractAddress,
) => {
  const exchangeAddresses = exchangeConfigs.map(e => e.address.toString());
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
  return true;
};

export const createComponents = transactionFactory(
  'createComponents',
  Contract.FundFactory,
  guard,
  prepareArgs,
  postProcess,
);
