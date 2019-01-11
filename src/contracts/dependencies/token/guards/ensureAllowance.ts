import {
  Address,
  greaterThan,
  isEqual,
  toFixed,
  QuantityInterface,
} from '@melonproject/token-math';

import { allowance } from '../calls/allowance';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';

const ensureAllowance = async (
  environment: Environment,
  amount: QuantityInterface,
  spender: Address,
) => {
  const balance = await allowance(environment, amount.token.address, {
    spender,
    owner: environment.wallet.address,
  });

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
