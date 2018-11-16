import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { createComponents } from '~/contracts/factory';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity, toFixed } from '@melonproject/token-math/quantity';
import { getAmguPrice, setAmguPrice } from '~/contracts/version';
import { subtract } from '@melonproject/token-math/bigInteger';
import { getPrice } from '@melonproject/token-math/price';
import { price } from '@melonproject/token-math';
import { update, getPrices } from '~/contracts/prices';

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

    const oldAmugPrice = await getAmguPrice(version);
    const newAmguPrice = await setAmguPrice(version, amguPrice);

    const args = {
      defaultTokens,
      exchangeConfigs,
      fundName,
      priceSource,
      quoteToken,
    };

    const newPrice = getPrice(
      createQuantity(baseToken, '1'),
      createQuantity(quoteToken, '1'),
    );

    await update(priceSource, [newPrice]);

    const prices = await getPrices(priceSource, [baseToken]);

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

    const diffQ = createQuantity('ETH', subtract(preBalance, postBalance));

    console.log(result, toFixed(diffQ));
  },
  30 * 1000,
);
