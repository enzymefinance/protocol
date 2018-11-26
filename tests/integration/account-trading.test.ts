import { getPrice } from '@melonproject/token-math/price';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';

import { initTestEnvironment } from '~/utils/environment';
import { deploySystem, Address, environment } from '~/utils';
import {
  createComponents,
  continueCreation,
  setupFund,
} from '~/contracts/factory';
import { getSettings, componentsFromSettings } from '~/contracts/fund/hub';
import { register, PolicedMethods } from '~/contracts/fund/policies';
import { update } from '~/contracts/prices';
import {
  requestInvestment,
  executeRequest,
} from '~/contracts/fund/participation';
import { getAmguPrice, setIsFund } from '~/contracts/version';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { redeem } from '~/contracts/fund/participation/transactions/redeem';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';
import { addTokenPairWhitelist } from '~/contracts/exchanges';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import { getOasisDexOrder } from '~/contracts/exchanges/calls/getOasisDexOrder';
import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';
import { takeOasisDexOrder } from '~/contracts/fund/trading/transactions/takeOasisDexOrder';
import { getFundOpenOrder } from '~/contracts/fund/trading/calls/getFundOpenOrder';
import { cancelOasisDexOrder } from '~/contracts/fund/trading/transactions/cancelOasisDexOrder';
import { swapTokensFromAccount } from '~/contracts/exchanges/transactions/swapTokensFromAccount';

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
  'Happy path',
  async () => {
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

    console.log(deployment);

    const [quoteToken, baseToken] = tokens;

    const defaultTokens = [quoteToken, baseToken];

    await createComponents(fundFactory, {
      defaultTokens,
      exchangeConfigs,
      fundName,
      priceSource,
      quoteToken,
    });

    await continueCreation(fundFactory);
    const hubAddress = await setupFund(fundFactory);

    const settings = await getSettings(hubAddress);

    await register(settings.policyManagerAddress, {
      method: PolicedMethods.makeOrder,
      policy: policies.priceTolerance,
    });
    await register(settings.policyManagerAddress, {
      method: PolicedMethods.takeOrder,
      policy: policies.priceTolerance,
    });
    await register(settings.policyManagerAddress, {
      method: PolicedMethods.executeRequest,
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

    const components = componentsFromSettings(settings);

    await Promise.all(
      Object.values(components).map((address: Address) =>
        setIsFund(version, { address }),
      ),
    );

    const amguPrice = await getAmguPrice(version);

    const request = await requestInvestment(settings.participationAddress, {
      investmentAmount: createQuantity(quoteToken, 1),
    });
    console.log('Requested an investment');

    const executedRequest = await executeRequest(settings.participationAddress);

    console.log('Executed request');

    // const redemption = await redeem(settings.participationAddress);
    // console.log('Redeemed');

    const holdings = await getFundHoldings(settings.accountingAddress);

    const matchingMarketAddress = deployment.exchangeConfigs.find(
      o => o.name === 'MatchingMarket',
    ).exchangeAddress;

    const kyberAddress = deployment.exchangeConfigs.find(
      o => o.name === 'KyberNetwork',
    ).exchangeAddress;

    const order1 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
      sell: createQuantity(deployment.tokens[0], 0.1),
      buy: createQuantity(deployment.tokens[1], 2),
    });
    expect(order1.buy).toEqual(createQuantity(deployment.tokens[1], 2));
    expect(order1.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));
    console.log(`Made order from account with id ${order1.id}`);

    const takenOrderFromAccount = await takeOrderFromAccountOasisDex(
      matchingMarketAddress,
      {
        id: order1.id,
        maxTakeAmount: order1.sell,
        buy: order1.buy,
        sell: order1.sell,
      },
    );

    console.log(`Took order from account with id ${order1.id}`);

    const order2 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
      sell: createQuantity(deployment.tokens[0], 0.1),
      buy: createQuantity(deployment.tokens[1], 2),
    });
    expect(order2.buy).toEqual(createQuantity(deployment.tokens[1], 2));
    expect(order2.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));
    console.log(`Made order from account with id ${order2.id}`);

    const canceledOrderFromAccount = await cancelOrderFromAccountOasisDex(
      matchingMarketAddress,
      {
        id: order2.id,
      },
    );

    console.log(`Canceled order from account with id ${order2.id}`);

    // const kyberSwap = await swapTokensFromAccount(kyberAddress, {
    //   srcQuantity: createQuantity(deployment.tokens[1], 0.00001),
    //   destQuantity: createQuantity(deployment.tokens[2], 0.06),
    //   minConversionRate: 0,
    // });

    // console.log(kyberSwap);
  },
  30 * 1000,
);
