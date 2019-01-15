import { Address } from '@melonproject/token-math';

const withDifferentAccount = (environment, account: Address) => ({
  ...environment,
  wallet: {
    ...environment.wallet,
    address: account,
  },
});

export { withDifferentAccount };
