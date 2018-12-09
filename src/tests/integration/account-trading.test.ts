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
import { approve } from '~/contracts/dependencies/token/transactions/approve';

const shared: any = {};

beforeAll(async () => {
  shared.env = await deploySystem(await initTestEnvironment());
  shared.accounts = await shared.env.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

test('Happy path', async () => {
  const fundName = `test-fund-${randomString()}`;
  const {
    exchangeConfigs,
    priceSource,
    tokens,
    policies,
    version,
  } = shared.env.deployment;
  const [quoteToken, baseToken] = tokens;
  const defaultTokens = [quoteToken, baseToken];
  const fees = [];

  await createComponents(shared.env, version, {
    defaultTokens,
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: quoteToken,
    priceSource,
    quoteToken,
  });

  await continueCreation(shared.env, version);
  const hubAddress = await setupFund(shared.env, version);
  const settings = await getSettings(shared.env, hubAddress);

  await register(shared.env, settings.policyManagerAddress, {
    method: FunctionSignatures.makeOrder,
    policy: policies.priceTolerance,
  });

  await register(shared.env, settings.policyManagerAddress, {
    method: FunctionSignatures.takeOrder,
    policy: policies.priceTolerance,
  });

  await register(shared.env, settings.policyManagerAddress, {
    method: FunctionSignatures.executeRequestFor,
    policy: policies.whitelist,
  });

  const newPrice = getPrice(
    createQuantity(baseToken, 1),
    createQuantity(quoteToken, 0.34),
  );

  await update(shared.env, priceSource, [newPrice]);

  // await approve({
  //   howMuch: createQuantity(quoteToken, 1),
  //   spender: new Address(shared.accounts[1]),
  // });

  await getAmguPrice(shared.env, version);

  const investmentAmount = createQuantity(quoteToken, 1);

  await approve(shared.env, {
    howMuch: investmentAmount,
    spender: settings.participationAddress,
  });

  await requestInvestment(shared.env, settings.participationAddress, {
    investmentAmount,
  });

  await executeRequest(shared.env, settings.participationAddress);

  // const redemption = await redeem(settings.participationAddress);
  // console.log('Redeemed');

  await getFundHoldings(shared.env, settings.accountingAddress);

  const matchingMarketAddress = shared.env.deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  // const kyberAddress = deployment.exchangeConfigs.find(
  //   o => o.name === 'KyberNetwork',
  // ).exchangeAddress;

  const order1 = await makeOrderFromAccountOasisDex(
    shared.env,
    matchingMarketAddress,
    {
      buy: createQuantity(shared.env.deployment.tokens[1], 2),
      sell: createQuantity(shared.env.deployment.tokens[0], 0.1),
    },
  );
  expect(order1.buy).toEqual(
    createQuantity(shared.env.deployment.tokens[1], 2),
  );
  expect(order1.sell).toEqual(
    createQuantity(shared.env.deployment.tokens[0], 0.1),
  );

  await takeOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
    buy: order1.buy,
    id: order1.id,
    maxTakeAmount: order1.sell,
    sell: order1.sell,
  });

  const order2 = await makeOrderFromAccountOasisDex(
    shared.env,
    matchingMarketAddress,
    {
      buy: createQuantity(shared.env.deployment.tokens[1], 2),
      sell: createQuantity(shared.env.deployment.tokens[0], 0.1),
    },
  );

  expect(order2.buy).toEqual(
    createQuantity(shared.env.deployment.tokens[1], 2),
  );
  expect(order2.sell).toEqual(
    createQuantity(shared.env.deployment.tokens[0], 0.1),
  );

  await cancelOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
    id: order2.id,
  });

  // const kyberSwap = await swapTokensFromAccount(kyberAddress, {
  //   srcQuantity: createQuantity(deployment.tokens[1], 0.00001),
  //   destQuantity: createQuantity(deployment.tokens[2], 0.06),
  //   minConversionRate: 0,
  // });

  // console.log(kyberSwap);
});
