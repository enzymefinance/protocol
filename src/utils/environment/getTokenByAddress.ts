import * as R from 'ramda';
import { Address, TokenInterface } from '@melonproject/token-math';

import { Environment } from './Environment';

export const getTokenByAddress = (
  environment: Environment,
  address: Address,
): TokenInterface => {
  const value = address.toLowerCase();
  const comparator = (token: TokenInterface) => {
    return token.address.toLowerCase() === value;
  };

  return R.find(comparator, environment.deployment.thirdPartyContracts.tokens);
};
