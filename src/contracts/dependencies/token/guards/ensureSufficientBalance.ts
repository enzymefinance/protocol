import {
  greaterThan,
  isEqual,
  toFixed,
  QuantityInterface,
} from '@melonproject/token-math/quantity';

import { balanceOf } from '..';
import { ensure } from '~/utils/guards';

const ensureSufficientBalance = async (
  minBalance: QuantityInterface,
  who,
  environment,
) => {
  const balance = await balanceOf(
    minBalance.token.address,
    { address: who },
    environment,
  );

  const hasSufficientBalance =
    greaterThan(balance, minBalance) || isEqual(balance, minBalance);

  ensure(
    hasSufficientBalance,
    `Insufficient ${minBalance.token.symbol}. Got: ${toFixed(
      balance,
    )}, need: ${toFixed(minBalance)}`,
  );
};

export { ensureSufficientBalance };
