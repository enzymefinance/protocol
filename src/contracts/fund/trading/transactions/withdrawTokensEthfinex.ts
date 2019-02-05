import { Contracts, Exchanges } from '~/Contracts';
import {
  transactionFactory,
  PrepareArgsFunction,
  GuardFunction,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { Address } from '@melonproject/token-math';
import { ensure } from '~/utils/guards/ensure';
import { emptyAddress } from '~/utils/constants/emptyAddress';

interface WithdrawTokensArgs {
  tokens: Address[];
}

const guard: GuardFunction<WithdrawTokensArgs> = async (
  environment,
  { tokens },
  contractAddress,
) => {
  ensure(tokens.length > 0, 'Tokens array cannot be empty');
  ensure(tokens.length <= 6, 'You can only withdraw 6 tokens at once');
};

const prepareArgs: PrepareArgsFunction<WithdrawTokensArgs> = async (
  environment,
  { tokens },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.Ethfinex,
  });
  const paddedTokens = tokens.slice(); // Deep copy
  while (paddedTokens.length < 6) {
    paddedTokens.push(emptyAddress);
  }

  const args = [
    exchangeIndex,
    FunctionSignatures.withdrawTokens,
    paddedTokens,
    [0, 0, 0, 0, 0, 0, 0, 0],
    '0x0',
    '0x0',
    '0x0',
    '0x0',
  ];

  return args;
};

const withdrawTokensEthfinex = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  undefined,
);

export { withdrawTokensEthfinex };
