import * as path from 'path';
import * as R from 'ramda';

import { withKeystoreSigner } from '~/utils/environment/withKeystoreSigner';
import { constructEnvironment } from '~/utils/environment/constructEnvironment';
import { testLogger } from '../utils/testLogger';
import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { toFixed, createQuantity } from '@melonproject/token-math/quantity';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
import { withDeployment } from '~/utils/environment/withDeployment';
// import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { Deployment } from '~/utils/environment/Environment';
import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
// import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';

/**
 * TODO:
 * - [ ] Share logic between integration and system tests
 * - [x] Load wallet from keystore
 * - [x] Create new accounts and fund them (not use the keystore account to
 *       interact)
 */

describe('playground', () => {
  beforeAll(() => {
    expect(process.env).toHaveProperty('JSON_RPC_ENDPOINT');
    expect(process.env).toHaveProperty('KEYSTORE_PASSWORD');
    expect(process.env).toHaveProperty('KEYSTORE_FILE');
  });

  test('Happy path', async () => {
    const keystore = require(path.join(
      process.cwd(),
      process.env.KEYSTORE_FILE,
    ));

    // tslint:disable-next-line:max-line-length
    const deployment: Deployment = require('../../../deployments/kovan-default.json');

    const masterEnvironment = R.compose(
      R.curry(withDeployment)(R.__, deployment),
      R.curry(withKeystoreSigner)(R.__, {
        keystore,
        password: process.env.KEYSTORE_PASSWORD,
      }),
      () =>
        constructEnvironment({
          endpoint: process.env.JSON_RPC_ENDPOINT || 'http://localhost:8545',
          logger: testLogger,
        }),
    )();

    const environment = withNewAccount(masterEnvironment);

    // const amguToken = await getAmguToken(
    //   masterEnvironment,
    //   deployment.melonContracts.version,
    // );
    // const amguPrice = createQuantity(amguToken, '1000000000');
    // await setAmguPrice(
    //   masterEnvironment,
    //   deployment.melonContracts.engine,
    //   amguPrice,
    // );

    const masterBalance = await getBalance(masterEnvironment);

    await sendEth(masterEnvironment, {
      howMuch: createQuantity('ETH', 5),
      to: environment.wallet.address,
    });

    const balance = await getBalance(environment);

    const weth = getTokenBySymbol(environment, 'WETH');
    const quantity = createQuantity(weth, 2);

    await deposit(environment, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const settings = await setupInvestedTestFund(environment);

    console.log(
      // process.env,
      process.cwd(),
      process.env.KEYSTORE_PASSWORD,
      process.env.KEYSTORE_FILE,
      process.env.JSON_RPC_ENDPOINT,
      toFixed(balance),
      toFixed(masterBalance),
      environment.wallet.address.toString(),
      settings,
      '\n\n\n\n\n\n˙',
    );

    const a = 1;
    expect(a).toBe(1);
  });
});
