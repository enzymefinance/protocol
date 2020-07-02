/*
 * @file Unit tests for vault via the UniswapAdapter
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
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/utils/metadata';
import { encodeTakeOrderArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager;
let managerTxOpts;
let dai, mln, weth;
let uniswapAdapter, uniswapFactory;
let mlnExchange, daiExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.DAI);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER);
  uniswapFactory = getDeployed(CONTRACT_NAMES.UNISWAP_FACTORY_INTERFACE, mainnetAddrs.uniswap.UniswapFactory);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  // Load interfaces for uniswap exchanges of tokens to be traded
  const mlnExchangeAddress = await call(uniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE_INTERFACE,
    mlnExchangeAddress
  );
  const daiExchangeAddress = await call(uniswapFactory, 'getExchange', [dai.options.address]);
  daiExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE_INTERFACE,
    daiExchangeAddress
  );
});

describe('takeOrder', () => {
  // TODO: input validation, if necessary
  // @dev Only need to run this once
  // describe('__validateTakeOrderParams', () => {
  // });

  describe('Fill Order 1: eth to token', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let tx;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = mln.options.address;

      makerQuantity = await call(
        mlnExchange,
        'getEthToTokenInputPrice',
        [takerQuantity]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
          uniswapAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
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
    let tx;

    beforeAll(async () => {
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = weth.options.address;

      makerQuantity = await call(
        mlnExchange,
        'getTokenToEthInputPrice',
        [takerQuantity]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
          uniswapAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
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
    let tx;

    beforeAll(async () => {
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = dai.options.address;

      const intermediateEth = await call(
        mlnExchange,
        'getTokenToEthInputPrice',
        [takerQuantity]
      );
      makerQuantity = await call(
        daiExchange,
        'getEthToTokenInputPrice',
        [intermediateEth]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
          uniswapAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
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
