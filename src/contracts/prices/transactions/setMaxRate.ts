import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

interface SetMaxRateArgs {
  maxRate: string;
}

type SetMaxRateResult = boolean;

export const setMaxRate: EnhancedExecute<
  SetMaxRateArgs,
  SetMaxRateResult
> = transactionFactory('setMaxRate', Contracts.KyberPriceFeed);
