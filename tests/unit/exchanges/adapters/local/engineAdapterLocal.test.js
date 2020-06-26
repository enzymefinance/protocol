/*
 * @file Unit tests for vault via the EngineAdapter (local only)
 *
 * @dev This file contains tests that will only work locally because of EVM manipulation.
 * Input validation tests are in engineAdapter.test.js
 * All funds are denominated in MLN so that funds can receive MLN as investment
 *
 * @test takeOrder: Order 1: full amount of liquid eth
 * @test takeOrder: Order 2: arbitrary amount of liquid eth
 * @test takeOrder: Order 3: greater amount of liquid eth than full amount
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3
let deployer, manager;
let defaultTxOpts, managerTxOpts;
let mln, weth;
let engine;
let engineAdapter;
let fund, fundFactory;
let takeOrderSignature;
let mlnPrice;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engine = getDeployed(CONTRACT_NAMES.ENGINE, web3);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
});

describe('takeOrder', () => {
  // TODO: maybe validate that even a makerAsset value of 0 or 1 works?
  // @dev Only need to run this once
  // describe('__validateTakeOrderParams', () => {
  // });

  describe('Fill Order 1: full amount of liquid eth', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts, web3);

      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager,
        web3
      });

      mlnPrice = new BN(await call(engine, 'enginePrice'));

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32, web3);
      await send(engine, 'thaw', [], defaultTxOpts, web3);

      // Get expected maker/taker quantities based on liquid eth
      makerAsset = weth.options.address;
      takerAsset = mln.options.address;
      makerQuantity = await call(engine, 'liquidEther');
      takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(mlnPrice)
      ).toString();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity: (new BN(makerQuantity).sub(new BN(1000000))).toString(),
        takerAsset,
        takerQuantity,
      });

      tx = await send(
        vault,
        'callOnIntegration',
        [
          engineAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.add(new BN(makerQuantity))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.sub(new BN(takerQuantity))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ENGINE_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ENGINE_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 2: arbitrary amount (half) of liquid eth', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Set amgu price
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts, web3);

      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager,
        web3
      });

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32, web3);
      await send(engine, 'thaw', [], {}, web3);

      // Get expected maker/taker quantities based on liquid eth
      makerAsset = weth.options.address;
      takerAsset = mln.options.address;
      makerQuantity = new BN(await call(engine, 'liquidEther')).div(new BN(2)).toString();
      takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(mlnPrice)
      ).toString();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      });

      tx = await send(
        vault,
        'callOnIntegration',
        [
          engineAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.add(new BN(makerQuantity))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.sub(new BN(takerQuantity))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ENGINE_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ENGINE_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 3: more than total available liquid eth', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Set amgu price
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts, web3);

      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager,
        web3
      });

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32, web3);
      await send(engine, 'thaw', [], {}, web3);

      // Get expected maker/taker quantities based on liquid eth
      makerAsset = weth.options.address;
      takerAsset = mln.options.address;
      makerQuantity = new BN(await call(engine, 'liquidEther')).add(new BN(1)).toString();
      takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(mlnPrice)
      ).add(new BN(1)).toString(); // adding 1 protects against rounding error (i.e. gives :ceiling")
    });

    it('cannot fill the order', async () => {
      const { vault } = fund;

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      });
      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
