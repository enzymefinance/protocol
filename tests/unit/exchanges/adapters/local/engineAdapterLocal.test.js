/*
 * @file Unit tests for vault via the EngineAdapter (local only)
 *
 * @dev This file contains tests that will only work locally because of EVM manipulation.
 * Input validation tests are in engineAdapter.test.js
 *
 * @test takeOrder: Order 1: full amount of liquid eth
 * @test takeOrder: Order 2: arbitrary amount of liquid eth
 * @test takeOrder: Order 3: greater amount of liquid eth than full amount
 */

import { BN, toWei } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';

let deployer;
let defaultTxOpts;
let contracts;
let mln, weth;
let engine;
let engineAdapter;
let fund;
let takeOrderSignature;
let exchangeIndex;
let mlnPrice;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;

  engine = contracts[CONTRACT_NAMES.ENGINE];
  engineAdapter = contracts[CONTRACT_NAMES.ENGINE_ADAPTER];

  const priceSource = contracts.TestingPriceFeed;
  mlnPrice = (await priceSource.methods
    .getPrice(mln.options.address)
    .call())[0];
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
      // Set amgu price
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      // Set up fund
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [engine.options.address],
        exchangeAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw');

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
      const { accounting, vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      });

      tx = await send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
      );

      postFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
      expect(orderFilled.exchangeAddress).toBe(engine.options.address);
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
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [engine.options.address],
        exchangeAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw');

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
      const { accounting, vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      });

      tx = await send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
      );

      postFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
      expect(orderFilled.exchangeAddress).toBe(engine.options.address);
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
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [engine.options.address],
        exchangeAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw');

      // Get expected maker/taker quantities based on liquid eth
      makerAsset = weth.options.address;
      takerAsset = mln.options.address;
      makerQuantity = new BN(await call(engine, 'liquidEther')).add(new BN(1)).toString();
      takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(mlnPrice)
      ).toString();
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
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
