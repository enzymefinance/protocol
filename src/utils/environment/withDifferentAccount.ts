import { Address } from '@melonproject/token-math/address';

const withDifferentAccount = (environment, account: Address) => ({
  ...environment,
  wallet: {
    ...environment.wallet,
    address: account,
  },
});

export { withDifferentAccount };
