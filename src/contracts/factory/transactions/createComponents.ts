import { IToken } from '@melonproject/token-math';

import { Address } from '~/utils/types';
import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

import getContract from '../utils/getContract';
// import ensure from '~/utils/guards/ensure';

interface ExchangeConfig {
  address: Address;
  adapterAddress: Address;
  takesCustody: boolean;
}

interface CreateComponentArgs {
  exchangeConfigs: ExchangeConfig[];
  defaultTokens: IToken[];
  priceSource: Address;
}

export const guards = async (contractAddress: string, params, environment) => {
  // createComponents
};

export const prepare = async (
  contractAddress: string,
  { exchangeConfigs, defaultTokens, priceSource },
) => {
  const contract = getContract(contractAddress);

  const exchangeAddresses = exchangeConfigs.map(e => e.address.toString());
  const adapterAddresses = exchangeConfigs.map(e =>
    e.adapterAddress.toString(),
  );
  const takesCustody = exchangeConfigs.map(e => e.takesCustody);
  const defaultTokenAddresses = defaultTokens.map(t => t.address);

  console.log(
    exchangeAddresses,
    adapterAddresses,
    defaultTokenAddresses,
    takesCustody,
    priceSource.toString(),
  );

  const transaction = contract.methods.createComponents(
    exchangeAddresses,
    adapterAddresses,
    defaultTokenAddresses,
    takesCustody,
    priceSource.toString(),
  );

  return transaction;
};

export const send = async (
  transaction,
  environment = getGlobalEnvironment(),
) => {
  console.log(environment.wallet.address);

  const receipt = await transaction
    .send({
      from: environment.wallet.address,
    })
    .on('error', (err, a, b) => console.log(err, a, b));

  console.log(receipt);

  return receipt;
};

export const validateReceipt = (receipt, params) => {
  return true;
};

const createComponents = async (
  contractAddress: string,
  // Test if named params are better for VS Code autocompletion --> Works
  { exchangeConfigs, defaultTokens, priceSource }: CreateComponentArgs,
  environment?,
) => {
  await guards(
    contractAddress,
    { exchangeConfigs, defaultTokens, priceSource },
    environment,
  );
  const transaction = await prepare(contractAddress, {
    exchangeConfigs,
    defaultTokens,
    priceSource,
  });
  const receipt = await send(transaction, environment);
  const result = validateReceipt(receipt, {
    exchangeConfigs,
    defaultTokens,
    priceSource,
  });
  return result;
};

export default createComponents;
