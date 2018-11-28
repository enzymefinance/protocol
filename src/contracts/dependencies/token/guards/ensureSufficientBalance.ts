import {
  greaterThan,
  isEqual,
  toFixed,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { balanceOf } from '../calls/balanceOf';
import { ensure } from '~/utils/guards/ensure';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

const ensureSufficientBalance = async (
  minBalance: QuantityInterface,
  who: Address,
  environment = getGlobalEnvironment(),
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
