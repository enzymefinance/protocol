import Environment from './Environment';

const getWeb3Options = (environment: Environment) => ({
  gas: environment.options.gasLimit,
  gasPrice: environment.options.gasPrice,
  from: environment.wallet && environment.wallet.address,
});

export default getWeb3Options;
