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

interface AddTokenPairWhitelistArgs {
  quoteToken: TokenInterface;
  baseToken: TokenInterface;
}

export const guards: GuardFunction<AddTokenPairWhitelistArgs> = async (
  environment: Environment,
  { quoteToken, baseToken }: AddTokenPairWhitelistArgs,
) => {
  ensure(
    isToken(quoteToken) && hasAddress(quoteToken),
    `Token ${display(quoteToken)} is invalid`,
  );
  ensure(
    isToken(baseToken) && hasAddress(baseToken),
    `Token ${display(baseToken)} is invalid`,
  );
};

export const prepareArgs: PrepareArgsFunction<
  AddTokenPairWhitelistArgs
> = async (_, { quoteToken, baseToken }: AddTokenPairWhitelistArgs) => {
  return [quoteToken.address.toString(), baseToken.address.toString()];
};

const addTokenPairWhitelist: EnhancedExecute<
  AddTokenPairWhitelistArgs,
  boolean
> = transactionFactory(
  'addTokenPairWhitelist',
  Contracts.MatchingMarket,
  guards,
  prepareArgs,
);

export { addTokenPairWhitelist };
