import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math';
import {
  IsInOpenMakeOrder,
  isInOpenMakeOrder,
} from '../calls/isInOpenMakeOrder';
import { ensure } from '~/utils/guards/ensure';

const ensureNotInOpenMakeOrder = async (
  environment: Environment,
  tradingAddress: Address,
  { makerToken }: IsInOpenMakeOrder,
) => {
  ensure(
    !(await isInOpenMakeOrder(environment, tradingAddress, { makerToken })),
    `There is already an open order with token ${makerToken.symbol}`,
  );
};

export { ensureNotInOpenMakeOrder };
