import {
  isToken,
  hasAddress,
  display,
  TokenInterface,
} from '@melonproject/token-math';
import { ensure } from '~/utils/guards/ensure';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
  GuardFunction,
} from '~/utils/solidity/transactionFactory';

interface CreateUniswapExchangeArgs {
  token: TokenInterface;
}

export const guards: GuardFunction<CreateUniswapExchangeArgs> = async (
  environment: Environment,
  { token }: CreateUniswapExchangeArgs,
) => {
  ensure(
    isToken(token) && hasAddress(token),
    `Token ${display(token)} is invalid`,
  );
};

export const prepareArgs: PrepareArgsFunction<
  CreateUniswapExchangeArgs
> = async (_, { token }: CreateUniswapExchangeArgs) => {
  return [token.address.toString()];
};

const createUniswapExchange: EnhancedExecute<
  CreateUniswapExchangeArgs,
  boolean
> = transactionFactory(
  'createExchange',
  Contracts.UniswapFactory,
  guards,
  prepareArgs,
);

export { createUniswapExchange };
