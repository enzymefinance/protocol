import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { getPrices } from '~/contracts/prices/calls/getPrices';
import { update } from '~/contracts/prices/transactions/update';
import { getAmguPrice } from '~/contracts/version/calls/getAmguPrice';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import {
  subtract,
  greaterThan,
  BigInteger,
} from '@melonproject/token-math/bigInteger';
import {
  getPrice,
  isEqual as isEqualPrice,
} from '@melonproject/token-math/price';
import { sign } from '~/utils/environment/sign';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

test('Set amgu and check its usage', async () => {
  const fundName = `test-fund-${randomString()}`;
  const deployment = await deploySystem();
  const {
    exchangeConfigs,
    priceSource,
    tokens,
    engine,
    // policies,
    version,
  } = deployment;
  const [quoteToken, baseToken] = tokens;

  const defaultTokens = [quoteToken, baseToken];
  const fees = [];
  const amguToken = await getAmguToken(version);
  const amguPrice = createQuantity(amguToken, '1000000000');
  const oldAmguPrice = await getAmguPrice(engine);
  const newAmguPrice = await setAmguPrice(engine, amguPrice);

  expect(isEqual(newAmguPrice, amguPrice)).toBe(true);
  expect(isEqual(newAmguPrice, oldAmguPrice)).toBe(false);

  const args = {
    defaultTokens,
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: quoteToken,
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

  const prepared = await createComponents.prepare(version, args);

  const preBalance = await shared.environment.eth.getBalance(
    shared.accounts[0],
  );

  const signedTransactionData = await sign(
    prepared.rawTransaction,
    shared.environment,
  );

  const result = await createComponents.send(
    version,
    signedTransactionData,
    args,
    undefined,
    shared.environment,
  );

  const postBalance = await shared.environment.eth.getBalance(
    shared.accounts[0],
  );

  const diffQ = subtract(preBalance, postBalance);

  expect(result).toBeTruthy();
  expect(greaterThan(diffQ, new BigInteger(prepared.rawTransaction.gas))).toBe(
    true,
  );
});
