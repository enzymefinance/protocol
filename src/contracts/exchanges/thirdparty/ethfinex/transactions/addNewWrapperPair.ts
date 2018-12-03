import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import {
  transactionFactory,
  GuardFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';

interface AddNewWrapperPairArgs {
  tokens: TokenInterface[];
  wrappers: Address[];
}

const guard: GuardFunction<AddNewWrapperPairArgs> = async params => {
  ensure(
    params.tokens.length === params.wrappers.length,
    `Different length of tokens (${params.tokens.length}) and wrappers (${
      params.wrappers.length
    }).`,
  );
};

const prepareArgs = async ({ tokens, wrappers }: AddNewWrapperPairArgs) => [
  tokens.map(t => t.address.toString()),
  wrappers.map(w => w.toString()),
];

const postProcess = async (result, params) => {
  ensure(
    result.events.AddNewPair.length === params.tokens.length &&
      result.events.AddNewPair.length === params.wrappers.length,
    'Not all wrappers added',
  );

  return result.events.AddNewPair.map(({ returnValues }) => returnValues);
};

const addNewWrapperPair = transactionFactory(
  'addNewWrapperPair',
  Contracts.EthfinexExchangeEfx,
  guard,
  prepareArgs,
  postProcess,
);

export { addNewWrapperPair };
