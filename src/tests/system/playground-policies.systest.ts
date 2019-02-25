import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, createPrice, valueIn } from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';

import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { updateKyber } from '~/contracts/prices/transactions/updateKyber';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { Contracts } from '~/Contracts';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';
import { allLogsWritten } from '../utils/testLogger';
import { register } from '~/contracts/fund/policies/transactions/register';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { deployContract as deploy } from '~/utils/solidity/deployContract';
import { takeOrderOnKyber } from '~/contracts/fund/trading/transactions/takeOrderOnKyber';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getPolicyInformation } from '~/contracts/fund/policies/calls/getPolicyInformation';
import { invest } from '~/contracts/fund/participation/transactions/invest';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:playground');

const shared: any = {};

describe('playground', () => {
  afterAll(async () => {
    await allLogsWritten();
  });

  beforeAll(async () => {
    shared.master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);
    shared.investor = await withNewAccount(shared.master);
    await sendEth(shared.master, {
      howMuch: createQuantity('ETH', 5),
      to: shared.investor.wallet.address,
    });

    const depositAmount = createQuantity(
      getTokenBySymbol(shared.master, 'WETH'),
      1,
    );
    await deposit(shared.investor, depositAmount.token.address, undefined, {
      value: depositAmount.quantity.toString(),
    });
  });

  test('Happy path: Fund 1', async () => {
    const log = getLog(shared.master);

    const { melonContracts } = shared.master.deployment;
    const manager = await withNewAccount(shared.master);
    const trader = await withNewAccount(shared.master);

    const amguPrice = createQuantity('MLN', '1000000000');
    await setAmguPrice(shared.master, melonContracts.engine, amguPrice);
    await updateKyber(shared.master, melonContracts.priceSource);

    const weth = getTokenBySymbol(manager, 'WETH');
    const mln = getTokenBySymbol(manager, 'MLN');
    const dgx = getTokenBySymbol(manager, 'DGX');
    const dai = getTokenBySymbol(manager, 'DAI');

    try {
      const mlnPrice = await getPrice(
        shared.master,
        melonContracts.priceSource.toString(),
        mln,
      );

      log.debug('MLN Price', mlnPrice);
    } catch (e) {
      throw new Error('Cannot get MLN Price from Kyber');
    }

    await sendEth(shared.master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    await sendEth(shared.master, {
      howMuch: createQuantity('ETH', 1),
      to: trader.wallet.address,
    });

    await transfer(shared.master, {
      howMuch: createQuantity(mln, 5),
      to: trader.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const assetBlacklist = await deploy(
      shared.master,
      Contracts.AssetBlacklist,
      [[dgx.address]],
    );

    const maxPositions = await deploy(shared.master, Contracts.MaxPositions, [
      2,
    ]);

    const maxConcentration = await deploy(
      shared.master,
      Contracts.MaxConcentration,
      ['100000000000000000'],
    );

    const userWhitelist = await deploy(shared.master, Contracts.UserWhitelist, [
      [shared.investor.wallet.address],
    ]);

    const routes = await setupInvestedTestFund(manager);

    await register(manager, routes.policyManagerAddress, [
      {
        method: FunctionSignatures.makeOrder,
        policy: shared.master.deployment.melonContracts.policies.priceTolerance,
      },
      {
        method: FunctionSignatures.takeOrder,
        policy: shared.master.deployment.melonContracts.policies.priceTolerance,
      },
      {
        method: FunctionSignatures.makeOrder,
        policy: assetBlacklist,
      },
      {
        method: FunctionSignatures.takeOrder,
        policy: assetBlacklist,
      },
      {
        method: FunctionSignatures.makeOrder,
        policy: maxPositions,
      },
      {
        method: FunctionSignatures.takeOrder,
        policy: maxPositions,
      },
      {
        method: FunctionSignatures.makeOrder,
        policy: maxConcentration,
      },
      {
        method: FunctionSignatures.takeOrder,
        policy: maxConcentration,
      },
      {
        method: FunctionSignatures.requestInvestment,
        policy: userWhitelist,
      },
    ]);

    const policyInformation = await getPolicyInformation(
      manager,
      routes.policyManagerAddress,
    );

    await expect(
      policyInformation.filter(p => p.name === 'Price tolerance')[0].parameters,
    ).toBe('10%');

    await expect(
      policyInformation.filter(p => p.name === 'Asset blacklist')[0].parameters,
    ).toBe('DGX');

    await expect(
      policyInformation.filter(p => p.name === 'Max positions')[0].parameters,
    ).toBe('2');

    await expect(
      policyInformation.filter(p => p.name === 'Max concentration')[0]
        .parameters,
    ).toBe('10%');

    await expect(
      makeOasisDexOrder(manager, routes.tradingAddress, {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(mln, 0.8),
      }),
    ).rejects.toThrow();

    await expect(
      makeOasisDexOrder(manager, routes.tradingAddress, {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(dgx, 100),
      }),
    ).rejects.toThrow();

    // await takeOasisDexOrder(manager, routes.tradingAddress, {
    //   id: orderFromTrader.id,
    //   maker: orderFromTrader.maker,
    //   makerQuantity: orderFromTrader.sell,
    //   takerQuantity: orderFromTrader.buy,
    // });

    await expect(
      makeOasisDexOrder(manager, routes.tradingAddress, {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(dai, 100),
      }),
    ).rejects.toThrow();

    const wethBalance = await balanceOf(manager, weth.address, {
      address: routes.vaultAddress,
    });
    const mlnPrice = await getPrice(
      manager,
      manager.deployment.melonContracts.priceSource.toString(),
      mln,
    );
    const ethPriceInMln = createPrice(mlnPrice.quote, mlnPrice.base);
    const mlnEquivalent = valueIn(ethPriceInMln, wethBalance);
    const makerQuantity = mlnEquivalent;
    await expect(
      takeOrderOnKyber(manager, routes.tradingAddress, {
        makerQuantity,
        takerQuantity: wethBalance,
      }),
    ).rejects.toThrow();
  });

  test('Happy path: Fund 2', async () => {
    const manager = await withNewAccount(shared.master);
    const mln = getTokenBySymbol(manager, 'MLN');
    const dgx = getTokenBySymbol(manager, 'DGX');
    const weth = getTokenBySymbol(manager, 'WETH');

    await sendEth(shared.master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const routes = await setupInvestedTestFund(manager);

    const assetWhitelist = await deploy(
      shared.master,
      Contracts.AssetWhitelist,
      [[mln.address]],
    );
    await register(manager, routes.policyManagerAddress, [
      {
        method: FunctionSignatures.makeOrder,
        policy: assetWhitelist,
      },
      {
        method: FunctionSignatures.takeOrder,
        policy: assetWhitelist,
      },
      {
        method: FunctionSignatures.requestInvestment,
        policy: assetWhitelist,
      },
    ]);

    await expect(
      makeOasisDexOrder(manager, routes.tradingAddress, {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(dgx, 100),
      }),
    ).rejects.toThrow();

    const investmentAmount = createQuantity(weth, 1);

    await approve(shared.investor, {
      howMuch: investmentAmount,
      spender: routes.participationAddress,
    });

    const fundToken = await getToken(manager, routes.sharesAddress);
    await expect(
      requestInvestment(shared.investor, routes.participationAddress, {
        investmentAmount,
        requestedShares: createQuantity(fundToken, 1),
      }),
    ).rejects.toThrow();
  });
});
