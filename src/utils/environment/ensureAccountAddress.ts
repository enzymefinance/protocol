import { ensure } from '~/utils/guards';

import { Environment } from './Environment';

export const hasAccountAddress = (environment: Environment): boolean =>
  !!environment.wallet && !!environment.wallet.address;

export const ensureAccountAddress = (environment: Environment) =>
  ensure(
    !!hasAccountAddress(environment),
    "No address found in environment to identify: 'environment.wallet.address'",
    environment,
  );
