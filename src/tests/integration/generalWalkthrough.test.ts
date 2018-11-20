import { getPrice } from '@melonproject/token-math/price';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';

import { initTestEnvironment } from '~/utils/environment';
import { deploySystem, Address } from '~/utils';
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

    console.log(amguPrice, request);

    const executedRequest = await executeRequest(settings.participationAddress);

    console.log(executedRequest);

    const redemption = await redeem(settings.participationAddress);
    console.log(redemption);

    const holdings = await getFundHoldings(settings.accountingAddress);
    console.log(holdings);

    const shutDown = await shutDownFund(hubAddress);

    console.log(shutDown);

    await expect(
      requestInvestment(settings.participationAddress, {
        investmentAmount: createQuantity(quoteToken, 1),
      }),
    ).rejects.toThrow(`Fund with hub address: ${hubAddress} is shut down`);

    const matchingMarketAddress = deployment.exchangeConfigs.find(
      o => o.name === 'MatchingMarket',
    ).exchangeAddress;

    const accountOrder = await makeOrderFromAccountOasisDex(
      matchingMarketAddress,
      {
        sell: createQuantity(deployment.tokens[0], 0.1),
        buy: createQuantity(deployment.tokens[1], 2),
      },
    );
    console.log(accountOrder);
    // await expect(accountOrder.buy).toEqual(
    //   createQuantity(deployment.tokens[1], 2),
    // );
    // await expect(accountOrder.sell).toEqual(
    //   createQuantity(deployment.tokens[0], 0.1),
    // );
    console.log(`Made order from account with id ${accountOrder.id}`);

    const order1 = await getOasisDexOrder(matchingMarketAddress, {
      id: accountOrder.id,
    });
    console.log('ORDER 1 ', order1);
    // const takenOrderFromAccount = await takeOrderFromAccountOasisDex(
    //   matchingMarketAddress,
    //   {
    //     id: accountOrder.id,
    //     maxTakeAmount: '1000000000000000000',
    //   },
    // );

    // console.log('TAKEN ', takenOrderFromAccount);

    // const orderFromFund = await makeOasisDexOrder(settings.tradingAddress, {
    //   maker: settings.tradingAddress,
    //   makerAssetSymbol: 'MLN',
    //   takerAssetSymbol: 'ETH',
    //   makerQuantity: 0.1,
    //   takerQuantity: 0.005,
    // });
    // console.log(orderFromFund);
  },
  30 * 1000,
);
