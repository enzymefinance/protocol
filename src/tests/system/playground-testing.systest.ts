import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import {
  toFixed,
  createQuantity,
  greaterThan,
  isEqual,
} from '@melonproject/token-math/quantity';
import {
  createPrice,
  toFixed as toFixedPrice,
} from '@melonproject/token-math/price';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
// import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';

import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';

import { getPrice } from '~/contracts/prices/calls/getPrice';
import { update } from '~/contracts/prices/transactions/update';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { toBeTrueWith } from '../utils/toBeTrueWith';
// import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';

expect.extend({ toBeTrueWith });

describe('playground', () => {
  test('Happy path', async () => {
    const masterEnvironment = await getSystemTestEnvironment();

    const { melonContracts } = masterEnvironment.deployment;

    const environment = withNewAccount(masterEnvironment);

    const amguToken = await getAmguToken(
      masterEnvironment,
      melonContracts.version,
    );
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(masterEnvironment, melonContracts.engine, amguPrice);

    const weth = getTokenBySymbol(environment, 'WETH');
    const mln = getTokenBySymbol(environment, 'MLN');

    await update(masterEnvironment, melonContracts.priceSource, [
      createPrice(createQuantity(weth, 1), createQuantity(weth, 1)),
      createPrice(createQuantity(mln, 1), createQuantity(weth, 2)),
    ]);

    const mlnPrice = await getPrice(
      masterEnvironment,
      melonContracts.priceSource.toString(),
      amguToken,
    );

    console.log('MLN Price', toFixedPrice(mlnPrice));

    const masterBalance = await getBalance(masterEnvironment);

    expect(masterBalance).toBeTrueWith(
      greaterThan,
      createQuantity(masterBalance.token, 6),
    );

    await sendEth(masterEnvironment, {
      howMuch: createQuantity('ETH', 5),
      to: environment.wallet.address,
    });

    const balance = await getBalance(environment);

    expect(balance).toBeTrueWith(isEqual, createQuantity('ETH', 5));

    const quantity = createQuantity(weth, 2);

    await deposit(environment, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const settings = await setupInvestedTestFund(environment);

    const a = 1;
    expect(a).toBe(1);
  });
});
