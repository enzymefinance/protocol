import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';

export interface AddNewWrapperPairArgs {
  tokens: TokenInterface[];
  wrappers: Address[];
}

const guard: GuardFunction<AddNewWrapperPairArgs> = async (_, params) => {
  ensure(
    params.tokens.length === params.wrappers.length,
    `Different length of tokens (${params.tokens.length}) and wrappers (${
      params.wrappers.length
    }).`,
  );
};

const prepareArgs: PrepareArgsFunction<AddNewWrapperPairArgs> = async (
  _,
  { tokens, wrappers },
) => [tokens.map(t => t.address.toString()), wrappers.map(w => w.toString())];

const postProcess = async (_, result, params) => {
  ensure(
    result.events.AddNewPair.length === params.tokens.length &&
      result.events.AddNewPair.length === params.wrappers.length,
    'Not all wrappers added',
  );

  return result.events.AddNewPair.map(({ returnValues }) => returnValues);
};

const addNewWrapperPair = transactionFactory(
  'addNewWrapperPair',
  Contracts.WrapperRegistryEFX,
  guard,
  prepareArgs,
  postProcess,
);

export { addNewWrapperPair };
