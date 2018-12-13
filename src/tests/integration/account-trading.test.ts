import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { deploySystem } from '~/utils/deploySystem';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { approve } from '~/contracts/dependencies/token/transactions/approve';

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
    engine,
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

  await getAmguPrice(engine);

  const investmentAmount = createQuantity(quoteToken, 1);

  await approve({
    howMuch: investmentAmount,
    spender: settings.participationAddress,
  });

  await requestInvestment(settings.participationAddress, {
    investmentAmount,
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

describe('account-trading', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deploySystem(await initTestEnvironment());
    shared.accounts = await shared.env.eth.getAccounts();
  });

  it('Happy path', async () => {
    const matchingMarketAddress = shared.env.deployment.exchangeConfigs.find(
      o => o.name === 'MatchingMarket',
    ).exchangeAddress;

    const mlnToken = getTokenBySymbol(shared.env, 'MLN');
    const wethToken = getTokenBySymbol(shared.env, 'WETH');

    const order1 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(wethToken, 0.1),
      },
    );
    expect(order1.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order1.sell).toEqual(createQuantity(wethToken, 0.1));

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
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(wethToken, 0.1),
      },
    );

    expect(order2.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order2.sell).toEqual(createQuantity(wethToken, 0.1));

    await cancelOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      id: order2.id,
    });
  });
});
