import { getPrice } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploy/deploySystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
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
import {
  BigInteger,
  power,
  multiply,
} from '@melonproject/token-math/bigInteger';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { LogLevels } from '~/utils/environment/Environment';

describe('generalWalkthrough', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deploySystem(await initTestEnvironment());
    shared.accounts = await shared.env.eth.getAccounts();
  });

  it('Happy path', async () => {
    const debug = shared.env.logger('melon:protocol:utils', LogLevels.DEBUG);
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
    const amguToken = await getAmguToken(shared.env, version);
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(shared.env, version, amguPrice);

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
      createQuantity(baseToken, '1'),
      createQuantity(quoteToken, '2'),
    );

    await update(shared.env, priceSource, [newPrice]);

    const investmentAmount = createQuantity(quoteToken, 1);

    await expect(
      requestInvestment(shared.env, settings.participationAddress, {
        investmentAmount,
      }),
    ).rejects.toThrow(`Insufficient allowance`);

    await approve(shared.env, {
      howMuch: investmentAmount,
      spender: settings.participationAddress,
    });
    await requestInvestment(shared.env, settings.participationAddress, {
      investmentAmount,
    });

    await executeRequest(shared.env, settings.participationAddress);

    debug('Executed request');

    // const redemption = await redeem(settings.participationAddress);
    // debug('Redeemed');

    await getFundHoldings(shared.env, settings.accountingAddress);

    const matchingMarketAddress = shared.env.deployment.exchangeConfigs.find(
      o => o.name === 'MatchingMarket',
    ).exchangeAddress;

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
    debug(`Made order from account with id ${order2.id}`);

    await cancelOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      id: order2.id,
    });

    debug(`Canceled order from account with id ${order2.id}`);

    const orderFromFund = await makeOasisDexOrder(
      shared.env,
      settings.tradingAddress,
      {
        maker: settings.tradingAddress,
        makerQuantity: createQuantity(shared.env.deployment.tokens[0], 0.1),
        takerQuantity: createQuantity(shared.env.deployment.tokens[1], 2),
      },
    );
    debug(`Made order from fund with id ${orderFromFund.id}`);

    const fundOrder = await getFundOpenOrder(
      shared.env,
      settings.tradingAddress,
      0,
    );

    await cancelOasisDexOrder(shared.env, settings.tradingAddress, {
      id: fundOrder.id,
      maker: settings.tradingAddress,
      makerAsset: fundOrder.makerAsset,
      takerAsset: fundOrder.takerAsset,
    });

    debug(`Canceled order ${fundOrder.id} from fund `);

    const order3 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(shared.env.deployment.tokens[0], 0.1),
        sell: createQuantity(shared.env.deployment.tokens[1], 2),
      },
    );
    expect(order3.sell).toEqual(
      createQuantity(shared.env.deployment.tokens[1], 2),
    );
    expect(order3.buy).toEqual(
      createQuantity(shared.env.deployment.tokens[0], 0.1),
    );
    debug(`Made order from account with id ${order3.id}`);

    await takeOasisDexOrder(shared.env, settings.tradingAddress, {
      id: order3.id,
      maker: order3.maker,
      makerQuantity: order3.sell,
      takerQuantity: order3.buy,
    });

    debug(`Took order from fund with id ${order3.id} `);

    await performCalculations(shared.env, settings.accountingAddress);

    await shutDownFund(shared.env, version, { hub: hubAddress });

    debug('Shut down fund');

    await expect(
      requestInvestment(shared.env, settings.participationAddress, {
        investmentAmount: createQuantity(quoteToken, 1),
      }),
    ).rejects.toThrow(`Fund with hub address: ${hubAddress} is shut down`);
  });
});
