// tslint:disable:max-line-length
import { getPrice } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { register } from '~/contracts/fund/policies/transactions/register';
import { update } from '~/contracts/prices/transactions/update';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { getAmguPrice } from '~/contracts/version/calls/getAmguPrice';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
// tslint:enable:max-line-length

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

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
  const fees = [];

  await createComponents(version, {
    defaultTokens,
    exchangeConfigs,
    fees,
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
    createQuantity(baseToken, 1),
    createQuantity(quoteToken, 0.34),
  );

  await update(priceSource, [newPrice]);

  // await approve({
  //   howMuch: createQuantity(quoteToken, 1),
  //   spender: new Address(shared.accounts[1]),
  // });

  await getAmguPrice(version);
  await requestInvestment(settings.participationAddress, {
    investmentAmount: createQuantity(quoteToken, 1),
  });

  await executeRequest(settings.participationAddress);

  // const redemption = await redeem(settings.participationAddress);
  // console.log('Redeemed');

  await getFundHoldings(settings.accountingAddress);

  const matchingMarketAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  // const kyberAddress = deployment.exchangeConfigs.find(
  //   o => o.name === 'KyberNetwork',
  // ).exchangeAddress;

  const order1 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });
  expect(order1.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order1.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));

  await takeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: order1.buy,
    id: order1.id,
    maxTakeAmount: order1.sell,
    sell: order1.sell,
  });

  const order2 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });

  expect(order2.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order2.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));

  await cancelOrderFromAccountOasisDex(matchingMarketAddress, {
    id: order2.id,
  });

  // const kyberSwap = await swapTokensFromAccount(kyberAddress, {
  //   srcQuantity: createQuantity(deployment.tokens[1], 0.00001),
  //   destQuantity: createQuantity(deployment.tokens[2], 0.06),
  //   minConversionRate: 0,
  // });

  // console.log(kyberSwap);
});
