import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = async ({
  tokens,
  wrappers,
}: {
  tokens: TokenInterface[];
  wrappers: Address[];
}) => [tokens.map(t => t.address.toString()), wrappers.map(w => w.toString())];

const addNewWrapperPair = transactionFactory(
  'addNewWrapperPair',
  Contracts.EthfinexExchangeEfx,
  undefined,
  prepareArgs,
);

export { addNewWrapperPair };
