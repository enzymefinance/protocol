import { Address } from '@melonproject/token-math/address';
import { getGlobalEnvironment } from './globalEnvironment';

const withDifferentAccount = (
  account: Address,
  environment = getGlobalEnvironment(),
) => ({
  ...environment,
  wallet: {
    address: account,
  },
});

export { withDifferentAccount };
