import { createPrice } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import {
  BigInteger,
  power,
  multiply,
} from '@melonproject/token-math/bigInteger';

import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts, Exchanges } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { register } from '~/contracts/fund/policies/transactions/register';
import { update } from '~/contracts/prices/transactions/update';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
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
import {
  LogLevels,
  Environment,
  Tracks,
} from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { calcGav } from '~/contracts/fund/accounting/calls/calcGav';

describe('generalWalkthrough', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    expect(shared.env.track).toBe(Tracks.TESTING);
    shared.accounts = await shared.env.eth.getAccounts();
  });

  test('Happy path', async () => {
    const debug = shared.env.logger('melon:protocol:utils', LogLevels.DEBUG);
    const fundName = `test-fund-${randomString()}`;

    const {
      exchangeConfigs,
      melonContracts,
      thirdPartyContracts,
    } = shared.env.deployment;

    const { priceSource, policies, version, engine } = melonContracts;

    const tokens = thirdPartyContracts.tokens;

    const [ethToken, mlnToken] = tokens;
    const defaultTokens = [ethToken, mlnToken];
    const amguToken = await getAmguToken(shared.env, version);
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(shared.env, engine, amguPrice);

    // Deploy fees
    const managementFee = getContract(
      shared.env,
      Contracts.ManagementFee,
      await deployContract(shared.env, Contracts.ManagementFee, []),
    );

    const performanceFee = getContract(
      shared.env,
      Contracts.PerformanceFee,
      await deployContract(shared.env, Contracts.PerformanceFee, []),
    );

    const fees = [
      {
        feeAddress: managementFee.options.address,
        feePeriod: new BigInteger(0),
        feeRate: new BigInteger(
          multiply(
            new BigInteger(2),
            power(new BigInteger(10), new BigInteger(16)),
          ),
        ),
      },
      {
        feeAddress: performanceFee.options.address,
        feePeriod: new BigInteger(86400 * 90),
        feeRate: new BigInteger(
          multiply(
            new BigInteger(20),
            power(new BigInteger(10), new BigInteger(16)),
          ),
        ),
      },
    ];

    await beginSetup(
      shared.env,
      version,
      {
        defaultTokens,
        exchangeConfigs,
        fees,
        fundName,
        nativeToken: ethToken,
        priceSource,
        quoteToken: ethToken,
      },
      { gas: '8000000' },
    );

    await createAccounting(shared.env, version);
    await createFeeManager(shared.env, version);
    await createParticipation(shared.env, version);
    await createPolicyManager(shared.env, version);
    await createShares(shared.env, version);
    await createTrading(shared.env, version);
    await createVault(shared.env, version);
    const hubAddress = await completeSetup(shared.env, version);

    const routes = await getRoutes(shared.env, hubAddress);

    await register(shared.env, routes.policyManagerAddress, {
      method: FunctionSignatures.makeOrder,
      policy: policies.priceTolerance,
    });

    await register(shared.env, routes.policyManagerAddress, {
      method: FunctionSignatures.takeOrder,
      policy: policies.priceTolerance,
    });

    await register(shared.env, routes.policyManagerAddress, {
      method: FunctionSignatures.executeRequestFor,
      policy: policies.userWhitelist,
    });

    const mlnPrice = createPrice(
      createQuantity(mlnToken, '1'),
      createQuantity(ethToken, '2'),
    );

    const ethPrice = createPrice(
      createQuantity(ethToken, '1'),
      createQuantity(ethToken, '1'),
    );

    await update(shared.env, priceSource, [ethPrice, mlnPrice]);

    debug('GAV empty', await calcGav(shared.env, routes.accountingAddress));

    const investmentAmount = createQuantity(ethToken, 1);

    await expect(
      requestInvestment(shared.env, routes.participationAddress, {
        investmentAmount,
      }),
    ).rejects.toThrow(`Insufficient allowance`);

    await approve(shared.env, {
      howMuch: investmentAmount,
      spender: routes.participationAddress,
    });

    await requestInvestment(shared.env, routes.participationAddress, {
      investmentAmount,
    });

    await executeRequest(shared.env, routes.participationAddress);

    debug(
      'Executed request',
      await calcGav(shared.env, routes.accountingAddress),
    );

    // const redemption = await redeem(routes.participationAddress);
    // debug('Redeemed');

    await getFundHoldings(shared.env, routes.accountingAddress);

    const matchingMarketAddress =
      shared.env.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    const order1 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(ethToken, 0.1),
      },
    );
    expect(order1.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order1.sell).toEqual(createQuantity(ethToken, 0.1));
    debug(`Made order from account with id ${order1.id}`);

    await takeOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      buy: order1.buy,
      id: order1.id,
      maxTakeAmount: order1.sell,
      sell: order1.sell,
    });

    debug(`Took order from account with id ${order1.id}`);

    const order2 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(ethToken, 0.1),
      },
    );

    expect(order2.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order2.sell).toEqual(createQuantity(ethToken, 0.1));
    debug(`Made order from account with id ${order2.id}`);

    await cancelOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      id: order2.id,
    });

    debug(`Canceled order from account with id ${order2.id}`);

    const orderFromFund = await makeOasisDexOrder(
      shared.env,
      routes.tradingAddress,
      {
        makerQuantity: createQuantity(ethToken, 0.1),
        takerQuantity: createQuantity(mlnToken, 2),
      },
    );
    debug(`Made order from fund with id ${orderFromFund.id}`);

    const fundOrder = await getFundOpenOrder(
      shared.env,
      routes.tradingAddress,
      0,
    );

    await cancelOasisDexOrder(shared.env, routes.tradingAddress, {
      id: fundOrder.id,
      maker: routes.tradingAddress,
      makerAsset: fundOrder.makerAsset,
      takerAsset: fundOrder.takerAsset,
    });

    debug(`Canceled order ${fundOrder.id} from fund `);

    const order3 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(ethToken, 0.1),
        sell: createQuantity(mlnToken, 2),
      },
    );
    expect(order3.sell).toEqual(createQuantity(mlnToken, 2));
    expect(order3.buy).toEqual(createQuantity(ethToken, 0.1));
    debug(`Made order from account with id ${order3.id}`);

    await takeOasisDexOrder(shared.env, routes.tradingAddress, {
      id: order3.id,
      maker: order3.maker,
      makerQuantity: order3.sell,
      takerQuantity: order3.buy,
    });

    debug(`Took order from fund with id ${order3.id}`);

    await performCalculations(shared.env, routes.accountingAddress);

    await shutDownFund(shared.env, version, { hub: hubAddress });

    debug('Shut down fund');

    await expect(
      requestInvestment(shared.env, routes.participationAddress, {
        investmentAmount: createQuantity(ethToken, 1),
      }),
    ).rejects.toThrow(`Fund with hub address: ${hubAddress} is shut down`);
  });
});
