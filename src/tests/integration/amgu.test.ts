import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { createComponents } from '~/contracts/factory';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getAmguPrice, setAmguPrice } from '~/contracts/version';

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

  const amguPrice = createQuantity(amguToken, 0.00000012);

  const oldAmugPrice = await getAmguPrice(version);
  const newAmguPrice = await setAmguPrice(version, amguPrice);

  console.log(
    JSON.stringify({ amguToken, oldAmugPrice, newAmguPrice }, null, 2),
  );

  await createComponents(fundFactory, {
    defaultTokens,
    exchangeConfigs,
    fundName,
    priceSource,
    quoteToken,
  });
});
