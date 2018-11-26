import 'babel-polyfill';
import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { createComponents } from '~/contracts/factory';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { update, getPrices } from '~/contracts/prices';
import { getAmguPrice, setAmguPrice } from '~/contracts/version';
import {
  subtract,
  greaterThan,
  BigInteger,
} from '@melonproject/token-math/bigInteger';
import {
  getPrice,
  isEqual as isEqualPrice,
} from '@melonproject/token-math/price';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

test(
  'Set amgu and check its usage',
  async () => {
    const fundName = `test-fund-${randomString()}`;
    const deployment = await deploySystem();
    const {
      exchangeConfigs,
      fundFactory,
      priceSource,
      tokens,
      // engine,
      // policies,
      version,
    } = deployment;
    const [quoteToken, baseToken] = tokens;

    const defaultTokens = [quoteToken, baseToken];
    const amguToken = await getAmguToken(fundFactory);
    const amguPrice = createQuantity(amguToken, '1000000000');
    const oldAmguPrice = await getAmguPrice(version);
    const newAmguPrice = await setAmguPrice(version, amguPrice);

    expect(isEqual(newAmguPrice, amguPrice)).toBe(true);
    expect(isEqual(newAmguPrice, oldAmguPrice)).toBe(false);

    const args = {
      defaultTokens,
      exchangeConfigs,
      fundName,
      priceSource,
      quoteToken,
    };

    const newPrice = getPrice(
      createQuantity(baseToken, '1'),
      createQuantity(quoteToken, '2'),
    );

    await update(priceSource, [newPrice]);

    const [price] = await getPrices(priceSource, [baseToken]);
    expect(isEqualPrice(price, newPrice)).toBe(true);

    const prepared = await createComponents.prepare(fundFactory, args);

    const preBalance = await shared.environment.eth.getBalance(
      shared.accounts[0],
    );

    const result = await createComponents.send(
      fundFactory,
      prepared,
      args,
      undefined,
      shared.environment,
    );

    const postBalance = await shared.environment.eth.getBalance(
      shared.accounts[0],
    );

    const diffQ = subtract(preBalance, postBalance);

    expect(result.success).toBe(true);
    expect(
      greaterThan(diffQ, new BigInteger(prepared.rawTransaction.gas)),
    ).toBe(true);
  },
  30 * 1000,
);
