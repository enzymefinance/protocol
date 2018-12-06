// tslint:disable:max-line-length
import { getPrice } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { register } from '~/contracts/fund/policies/transactions/register';
import { update } from '~/contracts/prices/transactions/update';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { setAmguPrice } from '~/contracts/version/transactions/setAmguPrice';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';
import { takeOasisDexOrder } from '~/contracts/fund/trading/transactions/takeOasisDexOrder';
import { getFundOpenOrder } from '~/contracts/fund/trading/calls/getFundOpenOrder';
import { cancelOasisDexOrder } from '~/contracts/fund/trading/transactions/cancelOasisDexOrder';
import { randomString } from '~/utils/helpers/randomString';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
// tslint:enable:max-line-length

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

test('Happy path', async () => {
  const fundName = `test-fund-${randomString()}`;

  const deployment = await deploySystem();

  const {
    exchangeConfigs,
    priceSource,
    tokens,
    policies,
    version,
  } = deployment;
  const [quoteToken, baseToken] = tokens;
  const defaultTokens = [quoteToken, baseToken];
  const amguToken = await getAmguToken(version);
  const amguPrice = createQuantity(amguToken, '1000000000');
  await setAmguPrice(version, amguPrice);

  await createComponents(version, {
    defaultTokens,
    exchangeConfigs,
    fundName,
    nativeToken: quoteToken,
    priceSource,
    quoteToken,
  });

  await continueCreation(version);
  const hubAddress = await setupFund(version);
  const settings = await getSettings(hubAddress);

  await register(settings.policyManagerAddress, {
    method: FunctionSignatures.makeOrder,
    policy: policies.priceTolerance,
  });

  await register(settings.policyManagerAddress, {
    method: FunctionSignatures.takeOrder,
    policy: policies.priceTolerance,
  });

  await register(settings.policyManagerAddress, {
    method: FunctionSignatures.executeRequestFor,
    policy: policies.whitelist,
  });

  const newPrice = getPrice(
    createQuantity(baseToken, '1'),
    createQuantity(quoteToken, '2'),
  );

  await update(priceSource, [newPrice]);

  const investmentAmount = createQuantity(quoteToken, 1);

  await approve({
    howMuch: investmentAmount,
    spender: settings.participationAddress,
  });

  await requestInvestment(settings.participationAddress, {
    investmentAmount,
  });

  console.log('Requested an investment');

  await executeRequest(settings.participationAddress);

  console.log('Executed request');

  // const redemption = await redeem(settings.participationAddress);
  // console.log('Redeemed');

  await getFundHoldings(settings.accountingAddress);

  const matchingMarketAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  const order1 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });
  expect(order1.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order1.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));
  console.log(`Made order from account with id ${order1.id}`);

  await takeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: order1.buy,
    id: order1.id,
    maxTakeAmount: order1.sell,
    sell: order1.sell,
  });

  console.log(`Took order from account with id ${order1.id}`);

  const order2 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });

  expect(order2.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order2.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));
  console.log(`Made order from account with id ${order2.id}`);

  await cancelOrderFromAccountOasisDex(matchingMarketAddress, {
    id: order2.id,
  });

  console.log(`Canceled order from account with id ${order2.id}`);

  const orderFromFund = await makeOasisDexOrder(settings.tradingAddress, {
    maker: settings.tradingAddress,
    makerQuantity: createQuantity(deployment.tokens[0], 0.1),
    takerQuantity: createQuantity(deployment.tokens[1], 2),
  });
  console.log(`Made order from fund with id ${orderFromFund.id}`);

  const fundOrder = await getFundOpenOrder(
    settings.tradingAddress,
    0,
    shared.environment,
  );

  await cancelOasisDexOrder(settings.tradingAddress, {
    id: fundOrder.id,
    maker: settings.tradingAddress,
    makerAsset: fundOrder.makerAsset,
    takerAsset: fundOrder.takerAsset,
  });

  console.log(`Canceled order ${fundOrder.id} from fund `);

  const order3 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[0], 0.1),
    sell: createQuantity(deployment.tokens[1], 2),
  });
  expect(order3.sell).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order3.buy).toEqual(createQuantity(deployment.tokens[0], 0.1));
  console.log(`Made order from account with id ${order3.id}`);

  await takeOasisDexOrder(settings.tradingAddress, {
    id: order3.id,
    maker: order3.maker,
    makerQuantity: order3.sell,
    takerQuantity: order3.buy,
  });

  console.log(`Took order from fund with id ${order3.id} `);

  await performCalculations(settings.accountingAddress);

  await shutDownFund(version, { hub: hubAddress });

  console.log('Shut down fund');

  await expect(
    requestInvestment(settings.participationAddress, {
      investmentAmount: createQuantity(quoteToken, 1),
    }),
  ).rejects.toThrow(`Fund with hub address: ${hubAddress} is shut down`);
});
