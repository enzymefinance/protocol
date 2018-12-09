import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from './Environment';

export const getTokenBySymbol = (
  environment: Environment,
  symbol: string,
): TokenInterface =>
  R.find(R.propEq('symbol', symbol), environment.deployment.tokens);
