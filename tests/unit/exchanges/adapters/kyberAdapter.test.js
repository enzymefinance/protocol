/*
 * @file Unit tests for vault via the KyberAdapter
 *
 * @dev Note that liquidity pool is only added to in top-level beforeAll,
 * which is fine because these unit tests are agnostic to pricefeed
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: eth to token
 * @test takeOrder: Order 2: token to eth
 * @test takeOrder: Order 3: token to token
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS,
} from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager;
let managerTxOpts;
let dai, mln, weth;
let kyberAdapter, kyberNetworkProxy;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.DAI, web3, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_INTERFACE, web3, mainnetAddrs.kyber.KyberNetworkProxy);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
});

describe('takeOrder', () => {
  // TODO: input validation, if necessary
  // @dev Only need to run this once
  // describe('__validateTakeOrderParams', () => {
  // });

  describe('Fill Order 1: eth to token', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = mln.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
      );

      makerQuantity = BNExpMul(
        new BN(takerQuantity.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
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
          kyberAdapter.options.address,
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
        CONTRACT_NAMES.KYBER_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.KYBER_ADAPTER,
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

  // @dev Set denomination asset to MLN to allow investment in MLN
  describe('Fill Order 2: token to eth', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = weth.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [takerAsset, KYBER_ETH_ADDRESS, takerQuantity],
      );

      makerQuantity = BNExpMul(
        new BN(takerQuantity.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        manager,
        fundFactory,
        web3
      });
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

      // TODO: this is the tx that fails now (just with revert, no message)
      tx = await send(
        vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
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
        CONTRACT_NAMES.KYBER_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.KYBER_ADAPTER,
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

  // @dev Set denomination asset to MLN to allow investment in MLN
  describe('Fill Order 3: token to token', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsDai, postFundHoldingsMln, postFundHoldingsDai;
    let tx;

    beforeAll(async () => {
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = dai.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [takerAsset, makerAsset, takerQuantity],
      );

      makerQuantity = BNExpMul(
        new BN(takerQuantity.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsDai = new BN(
        await call(vault, 'assetBalances', [dai.options.address])
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
          kyberAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsDai = new BN(
        await call(vault, 'assetBalances', [dai.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsDai).bigNumberEq(
        preFundHoldingsDai.add(new BN(makerQuantity))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.sub(new BN(takerQuantity))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.KYBER_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.KYBER_ADAPTER,
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
});
