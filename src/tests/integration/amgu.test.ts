import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { getPrices } from '~/contracts/prices/calls/getPrices';
import { update } from '~/contracts/prices/transactions/update';
import { getAmguPrice } from '~/contracts/engine/calls/getAmguPrice';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import {
  subtract,
  greaterThan,
  BigInteger,
} from '@melonproject/token-math/bigInteger';
import {
  createPrice,
  isEqual as isEqualPrice,
} from '@melonproject/token-math/price';
import { sign } from '~/utils/environment/sign';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { Environment, Tracks } from '~/utils/environment/Environment';

const shared: {
  env?: Environment;
  [p: string]: any;
} = {};

beforeAll(async () => {
  shared.env = await deployAndInitTestEnv();
  shared.accounts = await shared.env.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

test('Set amgu and check its usage', async () => {
  const fundName = `test-fund-${randomString()}`;
  const {
    exchangeConfigs,
    melonContracts,
    thirdPartyContracts,
  } = shared.env.deployment;
  const [quoteToken, baseToken] = thirdPartyContracts.tokens;

  const defaultTokens = [quoteToken, baseToken];
  const fees = [];
  const amguToken = await getAmguToken(shared.env, melonContracts.version);
  const amguPrice = createQuantity(amguToken, '1000000000');
  const oldAmguPrice = await getAmguPrice(shared.env, melonContracts.engine);
  const newAmguPrice = await setAmguPrice(
    shared.env,
    melonContracts.engine,
    amguPrice,
  );

  expect(isEqual(newAmguPrice, amguPrice)).toBe(true);
  expect(isEqual(newAmguPrice, oldAmguPrice)).toBe(false);

  const args = {
    defaultTokens,
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: quoteToken,
    priceSource: melonContracts.priceSource,
    quoteToken,
  };

  if (shared.env.track === Tracks.TESTING) {
    const newPrice = createPrice(
      createQuantity(baseToken, '1'),
      createQuantity(quoteToken, '2'),
    );

    await update(shared.env, melonContracts.priceSource, [newPrice]);

    const [price] = await getPrices(shared.env, melonContracts.priceSource, [
      baseToken,
    ]);
    expect(isEqualPrice(price, newPrice)).toBe(true);
  }

  const prepared = await beginSetup.prepare(
    shared.env,
    melonContracts.version,
    args,
  );

  const preBalance = await shared.env.eth.getBalance(shared.accounts[0]);

  const signedTransactionData = await sign(shared.env, prepared.rawTransaction);

  const result = await beginSetup.send(
    shared.env,
    melonContracts.version,
    signedTransactionData,
    args,
    undefined,
  );

  const postBalance = await shared.env.eth.getBalance(shared.accounts[0]);

  const diffQ = subtract(preBalance, postBalance);

  expect(result).toBeTruthy();
  expect(greaterThan(diffQ, new BigInteger(prepared.rawTransaction.gas))).toBe(
    true,
  );
});
