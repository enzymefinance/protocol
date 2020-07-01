/*
 * @file Unit tests for vault via the OasisDexAdapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: partial amount
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/utils/oasisDex';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager;
let defaultTxOpts, managerTxOpts;
let dai, mln, weth;
let oasisDexAdapter, oasisDexExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.DAI);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  oasisDexExchange = getDeployed(CONTRACT_NAMES.OASIS_DEX_EXCHANGE, web3, mainnetAddrs.oasis.OasisDexExchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let badAsset;
    let orderId;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');
      badAsset = dai.options.address;

      fund = await setupFundWithParams({
        integrationAdapters: [oasisDexAdapter.options.address],
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts,
        web3
      );
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts,
        web3
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      orderId = logMake.id;
    });

    it('does not allow different maker asset address than actual oasisDex order', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: badAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
        orderId,
      }, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible("Order maker asset does not match the input")
    });

    it('does not allow different taker asset address than actual oasisDex order', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset: badAsset,
        takerQuantity,
        orderId,
      }, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible("Order taker asset does not match the input")
    });

    // TODO: add fillamount to OasisAdapter
    // it('does not allow taker fill amount greater than order max', async () => {
      // const { vault } = fund;
      // const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      // await expect(
        // send(
          // vault,
          // 'callOnIntegration',
          // [
            // exchangeIndex,
            // takeOrderSignature,
            // [
              // EMPTY_ADDRESS,
              // EMPTY_ADDRESS,
              // makerAsset,
              // takerAsset,
              // EMPTY_ADDRESS,
              // EMPTY_ADDRESS,
              // EMPTY_ADDRESS,
              // EMPTY_ADDRESS
            // ],
            // [makerQuantity, takerQuantity, 0, 0, 0, 0, badFillQuantity, 0],
            // ['0x0', '0x0', '0x0', '0x0'],
            // orderId,
            // '0x0',
          // ],
          // defaultTxOpts
        // )
      // ).rejects.toThrowFlexible("Taker fill amount greater than available quantity")
    // });
  });

  describe('Fill Order 1: full amount', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let orderId;
    let tx;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      fund = await setupFundWithParams({
        integrationAdapters: [oasisDexAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts,
        web3
      );
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts,
        web3
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      orderId = logMake.id;
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
        orderId,
      }, web3);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          oasisDexAdapter.options.address,
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
        preFundHoldingsWeth.sub(new BN(takerQuantity))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(makerQuantity))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.OASIS_DEX_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.OASIS_DEX_ADAPTER,
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

  describe('Fill Order 2: partial amount', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      fund = await setupFundWithParams({
        integrationAdapters: [oasisDexAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts,
        web3
      );
      await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts,
        web3
      );

    });

    // TODO
    // test('order is filled through the fund', async () => {
      // const { vault } = fund;
      // const partialFillDivisor = new BN(2);
      // takerFillQuantity = new BN(takerQuantity).div(partialFillDivisor);
      // makerFillQuantity = new BN(makerQuantity).div(partialFillDivisor);

      // preFundHoldingsWeth = new BN(
        // await call(vault, 'assetBalances', [weth.options.address])
      // );
      // preFundHoldingsMln = new BN(
        // await call(vault, 'assetBalances', [mln.options.address])
      // );

      // tx = await send(
        // vault,
        // 'callOnIntegration',
        // [
          // exchangeIndex,
          // takeOrderSignature,
          // [
            // EMPTY_ADDRESS,
            // EMPTY_ADDRESS,
            // makerAsset,
            // takerAsset,
            // EMPTY_ADDRESS,
            // EMPTY_ADDRESS,
            // EMPTY_ADDRESS,
            // EMPTY_ADDRESS
          // ],
          // [makerQuantity, takerQuantity, 0, 0, 0, 0, takerFillQuantity.toString(), 0],
          // ['0x0', '0x0', '0x0', '0x0'],
          // orderId,
          // '0x0',
        // ],
        // defaultTxOpts
      // )

      // postFundHoldingsWeth = new BN(
        // await call(vault, 'assetBalances', [weth.options.address])
      // );
      // postFundHoldingsMln = new BN(
        // await call(vault, 'assetBalances', [mln.options.address])
      // );
    // });

    // it('correctly updates fund holdings', async () => {
      // expect(postFundHoldingsWeth).bigNumberEq(preFundHoldingsWeth.sub(takerFillQuantity));
      // expect(postFundHoldingsMln).bigNumberEq(preFundHoldingsMln.add(makerFillQuantity));
    // });

    // it('emits correct OrderFilled event', async () => {
      // const orderFilledCount = getEventCountFromLogs(
        // tx.logs,
        // CONTRACT_NAMES.OASIS_DEX_ADAPTER,
        // 'OrderFilled'
      // );
      // expect(orderFilledCount).toBe(1);

      // const orderFilled = getEventFromLogs(
        // tx.logs,
        // CONTRACT_NAMES.OASIS_DEX_ADAPTER,
        // 'OrderFilled'
      // );
      // expect(orderFilled.exchangeAddress).toBe(oasisDexExchange.options.address);
      // expect(orderFilled.buyAsset).toBe(makerAsset);
      // expect(new BN(orderFilled.buyAmount)).bigNumberEq(makerFillQuantity);
      // expect(orderFilled.sellAsset).toBe(takerAsset);
      // expect(new BN(orderFilled.sellAmount)).bigNumberEq(takerFillQuantity);
      // expect(orderFilled.feeAssets.length).toBe(0);
      // expect(orderFilled.feeAmounts.length).toBe(0);
    // });
  });
});
