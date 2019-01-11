import {
  EnhancedExecute,
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { TokenInterface } from '@melonproject/token-math';

type SetDecimalsArgs = TokenInterface;
type SetDecimalsResult = boolean;

const prepareArgs: PrepareArgsFunction<SetDecimalsArgs> = async (_, token) => [
  token.address.toString(),
  token.decimals,
];

const setDecimals: EnhancedExecute<
  SetDecimalsArgs,
  SetDecimalsResult
> = transactionFactory(
  'setDecimals',
  Contracts.TestingPriceFeed,
  undefined,
  prepareArgs,
);

export { setDecimals };
