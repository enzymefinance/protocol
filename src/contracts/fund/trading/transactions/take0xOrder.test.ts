import * as R from 'ramda';
import { initTestEnvironment, withDifferentAccount } from '~/utils/environment';
import { deploySystem } from '~/utils';
import {
  createComponents,
  continueCreation,
  setupFund,
} from '~/contracts/factory';
import { getSettings, componentsFromSettings } from '~/contracts/fund/hub';
import {
  requestInvestment,
  executeRequest,
} from '~/contracts/fund/participation';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { randomString } from '~/utils/helpers/randomString';
import { createOrder, signOrder } from '~/contracts/exchanges';
import { take0xOrder } from './take0xOrder';
import { setIsFund } from '~/contracts/version';
import { Address } from '@melonproject/token-math/address';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
  // shared.environmentNotManager = withDifferentAccount(
  //   shared.accounts[1],
  //   shared.environment,
  // );

  const fundName = `test-fund-${randomString()}`;
  const deployment = await deploySystem();
  const {
    exchangeConfigs,
    fundFactory,
    priceSource,
    tokens,
    policies,
    version,
  } = deployment;
  const [quoteToken, mlnToken] = tokens;
  const defaultTokens = [quoteToken, mlnToken];
  shared.quoteToken = quoteToken;

  await createComponents(fundFactory, {
    defaultTokens,
    exchangeConfigs,
    fundName,
    priceSource,
    quoteToken,
  });
  await continueCreation(fundFactory);
  shared.hubAddress = await setupFund(fundFactory);
  shared.settings = await getSettings(shared.hubAddress);
  shared.zeroExAddress = deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  await Promise.all(
    Object.values(componentsFromSettings(shared.settings)).map(
      (address: Address) => setIsFund(version, { address }),
    ),
  );

  await requestInvestment(shared.settings.participationAddress, {
    investmentAmount: createQuantity(quoteToken, 1),
  });
  await executeRequest(shared.settings.participationAddress);

  const makerQuantity = createQuantity(mlnToken, 1);
  const takerQuantity = createQuantity(quoteToken, 0.05);

  const unsigned0xOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  shared.signedOrder = await signOrder(unsigned0xOrder, shared.environment);
});

test('Take off-chain order from fund', async () => {
  // console.log(shared.signedOrder);
  const takerQuantity = createQuantity(shared.quoteToken, 0.02);

  const order = await take0xOrder(shared.settings.tradingAddress, {
    signedOrder: shared.signedOrder,
    takerQuantity,
  });

  expect(isEqual(order.takerFilledAmount, takerQuantity)).toBe(true);
});
