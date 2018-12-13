import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetPriceSourceArgs { address: Address; }

type SetPriceSourceResult = boolean;

export const setPriceSource: EnhancedExecute<
  SetPriceSourceArgs,
  SetPriceSourceResult
> = transactionFactory('setPriceSource', Contracts.Registry);

