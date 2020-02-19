/*
 * @file Unit tests for trading via the KyberAdapter
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
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpMul } from '~/tests/utils/BNmath';
import getAccounts from '~/deploy/utils/getAccounts';

import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
} from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts;
let contracts;
let eur, mln, weth;
let kyberAdapter, kyberNetworkProxy;
let fund;
let takeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  
  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  eur = contracts.EUR;
  mln = contracts.MLN;
  weth = contracts.WETH;

  kyberAdapter = contracts[CONTRACT_NAMES.KYBER_ADAPTER];
  kyberNetworkProxy = contracts[CONTRACT_NAMES.KYBER_NETWORK_PROXY];
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

      // Re-deploy Version contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);

      // Set up fund
      const version = deployed.contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [kyberNetworkProxy.options.address],
        exchangeAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;
    });

    test('order is filled through the fund', async () => {
      const { accounting, trading } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundAssetHoldings', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
      );

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      );

      postFundHoldingsWeth = new BN(
        await call(accounting, 'getFundAssetHoldings', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
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
      expect(orderFilled.exchangeAddress).toBe(kyberNetworkProxy.options.address);
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
    
      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [takerAsset, KYBER_ETH_ADDRESS, takerQuantity],
      );
    
      makerQuantity = BNExpMul(
        new BN(takerQuantity.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      // Re-deploy Version contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);

      // Set up fund
      const version = deployed.contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [kyberNetworkProxy.options.address],
        exchangeAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;
    });

    test('order is filled through the fund', async () => {
      const { accounting, trading } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundAssetHoldings', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
      );

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      );

      postFundHoldingsWeth = new BN(
        await call(accounting, 'getFundAssetHoldings', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
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
      expect(orderFilled.exchangeAddress).toBe(kyberNetworkProxy.options.address);
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
    let preFundHoldingsMln, preFundHoldingsEur, postFundHoldingsMln, postFundHoldingsEur;
    let tx;
  
    beforeAll(async () => {
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      makerAsset = eur.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [takerAsset, makerAsset, takerQuantity],
      );
    
      makerQuantity = BNExpMul(
        new BN(takerQuantity.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      // Re-deploy Version contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);

      // Set up fund
      const version = deployed.contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [kyberNetworkProxy.options.address],
        exchangeAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;
    });

    test('order is filled through the fund', async () => {
      const { accounting, trading } = fund;

      preFundHoldingsEur = new BN(
        await call(accounting, 'getFundAssetHoldings', [eur.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
      );

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      );

      postFundHoldingsEur = new BN(
        await call(accounting, 'getFundAssetHoldings', [eur.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundAssetHoldings', [mln.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsEur).bigNumberEq(
        preFundHoldingsEur.add(new BN(makerQuantity))
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
      expect(orderFilled.exchangeAddress).toBe(kyberNetworkProxy.options.address);
      expect(orderFilled.buyAsset).toBe(makerAsset);
      expect(orderFilled.buyAmount).toBe(makerQuantity);
      expect(orderFilled.sellAsset).toBe(takerAsset);
      expect(orderFilled.sellAmount).toBe(takerQuantity);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });
});
