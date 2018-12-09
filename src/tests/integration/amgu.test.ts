import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { getPrices } from '~/contracts/prices/calls/getPrices';
import { update } from '~/contracts/prices/transactions/update';
import { getAmguPrice } from '~/contracts/version/calls/getAmguPrice';
import { setAmguPrice } from '~/contracts/version/transactions/setAmguPrice';
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

describe('amgu', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deploySystem(await initTestEnvironment());
    shared.accounts = await shared.env.eth.getAccounts();
  });

  const randomString = (length = 4) =>
    Math.random()
      .toString(36)
      .substr(2, length);

  it('Set amgu and check its usage', async () => {
    const fundName = `test-fund-${randomString()}`;
    const {
      exchangeConfigs,
      priceSource,
      tokens,
      // engine,
      // policies,
      version,
    } = shared.env.deployment;
    const [quoteToken, baseToken] = tokens;

    const defaultTokens = [quoteToken, baseToken];
    const fees = [];
    const amguToken = await getAmguToken(shared.env, version);
    const amguPrice = createQuantity(amguToken, '1000000000');
    const oldAmguPrice = await getAmguPrice(shared.env, version);
    const newAmguPrice = await setAmguPrice(shared.env, version, amguPrice);

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

    await update(shared.env, priceSource, [newPrice]);

    const [price] = await getPrices(shared.env, priceSource, [baseToken]);
    expect(isEqualPrice(price, newPrice)).toBe(true);

    const prepared = await createComponents.prepare(shared.env, version, args);

    const preBalance = await shared.env.eth.getBalance(shared.accounts[0]);

    const signedTransactionData = await sign(
      shared.env,
      prepared.rawTransaction,
    );

    const result = await createComponents.send(
      shared.env,
      version,
      signedTransactionData,
      args,
    );

    const postBalance = await shared.env.eth.getBalance(shared.accounts[0]);

    const diffQ = subtract(preBalance, postBalance);

    expect(result).toBeTruthy();
    expect(
      greaterThan(diffQ, new BigInteger(prepared.rawTransaction.gas)),
    ).toBe(true);
  });
});
