import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface SetUpdaterArgs {
  address: Address;
}

type SetUpdaterResult = boolean;

export const setUpdater: EnhancedExecute<
  SetUpdaterArgs,
  SetUpdaterResult
> = transactionFactory('setUpdater', Contracts.KyberPriceFeed);
