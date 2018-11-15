import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { createComponents } from '~/contracts/factory';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';

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
    engine,
    // policies,
    // version,
  } = deployment;
  const [quoteToken, baseToken] = tokens;

  const defaultTokens = [quoteToken, baseToken];

  const amguToken = await getAmguToken(engine);

  console.log(amguToken);

  await createComponents(fundFactory, {
    defaultTokens,
    exchangeConfigs,
    fundName,
    priceSource,
    quoteToken,
  });
});
