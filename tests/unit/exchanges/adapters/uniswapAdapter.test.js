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

import web3 from '~/deploy/utils/get-web3';
import { call, fetchContract, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, weth;
let uniswapAdapter, uniswapFactory;
let mlnExchange, daiExchange;
let fund;
let takeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;

  uniswapAdapter = contracts[CONTRACT_NAMES.UNISWAP_ADAPTER];
  uniswapFactory = contracts[CONTRACT_NAMES.UNISWAP_EXCHANGE];

  // Load interfaces for uniswap exchanges of tokens to be traded
  const iUniswapFactory = await fetchContract(
    "IUniswapFactory",
    contracts.UniswapFactory.options.address
  );
  const mlnExchangeAddress = await call(iUniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await fetchContract(
    "IUniswapExchange",
    mlnExchangeAddress
  );
  const daiExchangeAddress = await call(uniswapFactory, 'getExchange', [dai.options.address]);
  daiExchange = await fetchContract(
    "IUniswapExchange",
    daiExchangeAddress
  );

  // Seed uniswap exchanges with liquidity
  const ethLiquidityAmount = toWei('1', 'ether');
  const daiLiquidityAmount = toWei('200', 'ether');
  const mlnLiquidityAmount = toWei('2', 'ether');

  const minLiquidity = 0; // For first liquidity provider
  const deadline = (await web3.eth.getBlock('latest')).timestamp + 300 // Arbitrary

  await send(
    mln,
    'approve',
    [mlnExchange.options.address, mlnLiquidityAmount],
    defaultTxOpts
  );
  await send(
    mlnExchange,
    'addLiquidity',
    [minLiquidity, mlnLiquidityAmount, deadline],
    { ...defaultTxOpts, value: ethLiquidityAmount }
  );

  await send(
    dai,
    'approve',
    [daiExchange.options.address, daiLiquidityAmount],
    defaultTxOpts
  );
  await send(
    daiExchange,
    'addLiquidity',
    [minLiquidity, daiLiquidityAmount, deadline],
    { ...defaultTxOpts, value: ethLiquidityAmount }
  );
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

      makerQuantity = await call(
        mlnExchange,
        'getEthToTokenInputPrice',
        [takerQuantity]
      );

      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [uniswapFactory.options.address],
        exchangeAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;
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
        preFundHoldingsWeth.sub(new BN(takerQuantity))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(makerQuantity))
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
      expect(orderFilled.exchangeAddress).toBe(uniswapFactory.options.address);
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 2: token to eth', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
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

      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [uniswapFactory.options.address],
        exchangeAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;
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
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.exchangeAddress).toBe(uniswapFactory.options.address);
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 3: token to token', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let preFundHoldingsMln, preFundHoldingsDai, postFundHoldingsMln, postFundHoldingsDai;
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

      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [uniswapFactory.options.address],
        exchangeAdapters: [uniswapAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        fundFactory
      });
      exchangeIndex = 0;
    });

    test('order is filled through the fund', async () => {
      const { accounting, vault } = fund;

      preFundHoldingsDai = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [dai.options.address])
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

      postFundHoldingsDai = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [dai.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.UNISWAP_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.exchangeAddress).toBe(uniswapFactory.options.address);
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });
});
