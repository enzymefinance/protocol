import { Address } from '@melonproject/token-math';
import { Environment } from './Environment';

const withDifferentAccount = (
  environment: Environment,
  account: Address,
): Environment => ({
  ...environment,
  wallet: {
    ...environment.wallet,
    address: account,
  },
});

export { withDifferentAccount };
