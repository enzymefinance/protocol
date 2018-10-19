import { IToken } from '@melonproject/token-math';

import { Address } from '~/utils/types';
import {
  Contract,
  getContract,
  prepareTransaction,
  sendTransaction,
} from '~/utils/solidity';

// import ensure from '~/utils/guards/ensure';

interface ExchangeConfig {
  address: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}

interface CreateComponentArgs {
  exchangeConfigs: ExchangeConfig[];
  quoteToken: IToken;
  defaultTokens: IToken[];
  priceSource: Address;
}

const guards = async (contractAddress: string, params, environment) => {
  // createComponents
};

const prepare = async (
  contractAddress: string,
  { exchangeConfigs, quoteToken, defaultTokens, priceSource },
  environment,
) => {
  const contract = getContract(Contract.FundFactory, contractAddress);

  const exchangeAddresses = exchangeConfigs.map(e => e.address.toString());
  const adapterAddresses = exchangeConfigs.map(e =>
    e.adapterAddress.toString(),
  );
  const takesCustody = exchangeConfigs.map(e => e.takesCustody);
  const defaultTokenAddresses = defaultTokens.map(t => t.address);
  const quoteTokenAddress = quoteToken.address;

  const transaction = contract.methods.createComponents(
    exchangeAddresses,
    adapterAddresses,
    quoteTokenAddress,
    defaultTokenAddresses,
    takesCustody,
    priceSource.toString(),
  );
  transaction.name = 'createComponents';

  const prepared = await prepareTransaction(transaction, environment);

  return prepared;
};

const validateReceipt = (receipt, params) => {
  return true;
};

export const createComponents = async (
  contractAddress: string,
  // Test if named params are better for VS Code autocompletion --> Works
  {
    exchangeConfigs,
    quoteToken,
    defaultTokens,
    priceSource,
  }: CreateComponentArgs,
  environment?,
) => {
  await guards(
    contractAddress,
    { exchangeConfigs, defaultTokens, priceSource },
    environment,
  );
  const prepared = await prepare(
    contractAddress,
    {
      defaultTokens,
      exchangeConfigs,
      priceSource,
      quoteToken,
    },
    environment,
  );
  const receipt = await sendTransaction(prepared, environment);
  const result = validateReceipt(receipt, {
    defaultTokens,
    exchangeConfigs,
    priceSource,
    quoteToken,
  });
  return result;
};
