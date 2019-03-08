import { Environment } from './Environment';

export const getWeb3Options = (environment: Environment) => ({
  from: environment.wallet && environment.wallet.address.toString(),
  gas: environment.options.gasLimit,
  gasPrice: environment.options.gasPrice,
});
