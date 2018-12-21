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
import { Deployment, Environment } from '~/utils/environment/Environment';
import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getChainName } from '~/utils/environment/chainName';
import { withPrivateKeySigner } from '~/utils/environment/withPrivateKeySigner';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { updateKyber } from '~/contracts/prices/transactions/updateKyber';
import { getPrice } from '~/contracts/prices/calls/getPrice';
// import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';

/**
 * TODO:
 * - [ ] Share logic between integration and system tests
 * - [x] Load wallet from keystore
 * - [x] Create new accounts and fund them (not use the keystore account to
 *       interact)
 */

const getEnvironment = async (): Promise<Environment> => {
  const baseEnvironment = constructEnvironment({
    endpoint: process.env.JSON_RPC_ENDPOINT || 'http://localhost:8545',
    logger: testLogger,
  });

  const deploymentId = `${await getChainName(baseEnvironment)}-${
    baseEnvironment.track
  }`;
  // tslint:disable-next-line:max-line-length
  const deployment: Deployment = require(`../../../deployments/${deploymentId}.json`);

  const environmentWithDeployment = withDeployment(baseEnvironment, deployment);

  const selectSigner = R.cond([
    [
      R.prop('KEYSTORE_FILE'),
      async env =>
        await withKeystoreSigner(environmentWithDeployment, {
          keystore: require(path.join(
            process.cwd(),
            R.prop('KEYSTORE_FILE', env),
          )),
          password: R.prop('KEYSTORE_PASSWORD', env),
        }),
    ],
    [
      R.prop('PRIVATE_KEY'),
      async env =>
        await withPrivateKeySigner(
          environmentWithDeployment,
          R.prop('PRIVATE_KEY', env),
        ),
    ],
    [
      R.T,
      () => {
        throw new Error('Neither PRIVATE_KEY nor KEYSTORE_FILE found in env');
      },
    ],
  ]);

  const environment = await selectSigner(process.env);

  return environment;
};

describe('playground', () => {
  test('Happy path', async () => {
    const masterEnvironment = await getEnvironment();

    const { melonContracts } = masterEnvironment.deployment;

    const environment = withNewAccount(masterEnvironment);

    const amguToken = await getAmguToken(
      masterEnvironment,
      melonContracts.version,
    );
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(masterEnvironment, melonContracts.engine, amguPrice);

    await updateKyber(masterEnvironment, melonContracts.priceSource);

    console.log(amguToken);

    const mlnPrice = await getPrice(
      masterEnvironment,
      melonContracts.priceSource.toString(),
      amguToken,
    );

    console.log(amguToken, mlnPrice);

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
