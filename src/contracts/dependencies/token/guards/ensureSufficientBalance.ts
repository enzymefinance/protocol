import {
  greaterThan,
  isEqual,
  toFixed,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { balanceOf } from '../calls/balanceOf';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';

const ensureSufficientBalance = async (
  environment: Environment,
  minBalance: QuantityInterface,
  who: Address,
) => {
  const balance = await balanceOf(environment, minBalance.token.address, {
    address: who,
  });

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
