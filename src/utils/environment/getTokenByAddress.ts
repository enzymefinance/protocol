import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from './Environment';
import { Address } from '@melonproject/token-math/address';

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
