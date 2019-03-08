import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

interface SetMaxSpreadArgs {
  maxSpread: string;
}

type SetMaxSpreadResult = boolean;

export const setMaxSpread: EnhancedExecute<
  SetMaxSpreadArgs,
  SetMaxSpreadResult
> = transactionFactory('setMaxSpread', Contracts.KyberPriceFeed);
