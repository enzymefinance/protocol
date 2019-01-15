import { TokenInterface } from '@melonproject/token-math';
import {
  callFactory,
  PrepareCallArgsFunction,
  PostProcessCallFunction,
} from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

export interface IsInOpenMakeOrder {
  makerToken: TokenInterface;
}

const prepareArgs: PrepareCallArgsFunction = (
  _,
  { makerToken }: IsInOpenMakeOrder,
) => [makerToken.address.toString()];

const postProcess: PostProcessCallFunction = async (_, result) => result;

const isInOpenMakeOrder = callFactory('isInOpenMakeOrder', Contracts.Trading, {
  postProcess,
  prepareArgs,
});

export { isInOpenMakeOrder };
