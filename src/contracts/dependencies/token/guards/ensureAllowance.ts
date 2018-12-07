import {
  greaterThan,
  isEqual,
  toFixed,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { allowance } from '../calls/allowance';
import { ensure } from '~/utils/guards/ensure';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

const ensureAllowance = async (
  amount: QuantityInterface,
  spender: Address,
  environment = getGlobalEnvironment(),
) => {
  const balance = await allowance(
    amount.token.address,
    { spender, owner: environment.wallet.address },
    environment,
  );

  const hasSufficientBalance =
    greaterThan(balance, amount) || isEqual(balance, amount);

  ensure(
    hasSufficientBalance,
    `Insufficient allowance for ${amount.token.symbol}. Got: ${toFixed(
      balance,
    )}, need: ${toFixed(amount)}`,
  );
};

export { ensureAllowance };
