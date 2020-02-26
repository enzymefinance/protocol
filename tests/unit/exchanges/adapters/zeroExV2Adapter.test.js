/*
 * @file Unit tests for trading via the ZeroExV2Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: full amount w/ takerFee
 * TODO: takeOrder: Order 3: partial amount w/ takerFee
 */

import { BN, toWei, randomHex } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, zrx, weth;
let priceSource;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund;
let takeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  
  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  zrx = contracts.ZRX;
  weth = contracts.WETH;
  dai = contracts.DAI;

  priceSource = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];  

  erc20Proxy = contracts[CONTRACT_NAMES.ZERO_EX_V2_ERC20_PROXY];  
  zeroExAdapter = contracts[CONTRACT_NAMES.ZERO_EX_V2_ADAPTER];
  zeroExExchange = contracts[CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE];
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let badTokenAddress;
  
    beforeAll(async () => {
      // Set up fund
      const version = contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [zeroExExchange.options.address],
        exchangeAdapters: [zeroExAdapter.options.address],
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;
    });
    
    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      badTokenAddress = dai.options.address;
  
      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        },
      );
  
      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    it('does not allow different maker asset address and maker asset data address', async () => {
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            [
              deployer,
              EMPTY_ADDRESS,
              badTokenAddress,
              takerTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [
              signedOrder.makerAssetAmount,
              signedOrder.takerAssetAmount,
              signedOrder.makerFee,
              signedOrder.takerFee,
              signedOrder.expirationTimeSeconds,
              signedOrder.salt,
              fillQuantity,
              0,
            ],
            [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
            '0x0',
            signedOrder.signature,
          ],
          defaultTxOpts
        )
      ).rejects.toThrowFlexible("makerAssetData does not match address");
    });
  
    it('does not allow different taker asset address and taker asset data address', async () => {
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            [
              deployer,
              EMPTY_ADDRESS,
              makerTokenAddress,
              badTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [
              signedOrder.makerAssetAmount,
              signedOrder.takerAssetAmount,
              signedOrder.makerFee,
              signedOrder.takerFee,
              signedOrder.expirationTimeSeconds,
              signedOrder.salt,
              fillQuantity,
              0,
            ],
            [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
            '0x0',
            signedOrder.signature,
          ],
          defaultTxOpts
        )
      ).rejects.toThrowFlexible("takerAssetData does not match address");
    });
  
    it('does not allow taker fill amount greater than order max', async () => {
      const { trading } = fund;
      const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            [
              deployer,
              EMPTY_ADDRESS,
              makerTokenAddress,
              takerTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [
              signedOrder.makerAssetAmount,
              signedOrder.takerAssetAmount,
              signedOrder.makerFee,
              signedOrder.takerFee,
              signedOrder.expirationTimeSeconds,
              signedOrder.salt,
              badFillQuantity,
              0,
            ],
            [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
            '0x0',
            signedOrder.signature,
          ],
          defaultTxOpts
        )
      ).rejects.toThrowFlexible("taker fill amount greater than max order quantity");
    });
  });

  describe('Fill Order 1: no fees', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy Version contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);

      // Set up fund
      const version = deployed.contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [zeroExExchange.options.address],
        exchangeAdapters: [zeroExAdapter.options.address],
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
    
    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
  
      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        },
      );
  
      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { accounting, trading } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            deployer,
            EMPTY_ADDRESS,
            makerTokenAddress,
            takerTokenAddress,
            signedOrder.feeRecipientAddress,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [
            signedOrder.makerAssetAmount,
            signedOrder.takerAssetAmount,
            signedOrder.makerFee,
            signedOrder.takerFee,
            signedOrder.expirationTimeSeconds,
            signedOrder.salt,
            fillQuantity,
            0,
          ],
          [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
          '0x0',
          signedOrder.signature,
        ],
        defaultTxOpts
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
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.exchangeAddress).toBe(zeroExExchange.options.address);
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 2: w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFee;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let preFundHoldingsZrx, postFundHoldingsZrx;
    let tx;

    beforeAll(async () => {
      // Re-deploy Version contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);

      // Set up fund
      const version = deployed.contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [zeroExExchange.options.address],
        exchangeAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;

      // Make 2nd investment with ZRX to allow taker fee trade
      takerFee = toWei('0.0001', 'ether');
      await send(fund.participation, 'enableInvestment', [[zrx.options.address]], defaultTxOpts);
      await investInFund({
        fundAddress: fund.hub.options.address,
        investment: {
          contribAmount: takerFee,
          investor: deployer,
          tokenContract: zrx
        },
        isInitial: false,
        tokenPriceData: {
          priceSource,
          tokenAddresses: [
            zrx.options.address
          ]
        }
      });
    });
    
    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
  
      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          takerFee,
          feeRecipientAddress: randomHex(20),
        },
      );
  
      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { accounting, trading } = fund;

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );
      preFundHoldingsZrx = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [zrx.options.address])
      );

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            deployer,
            EMPTY_ADDRESS,
            makerTokenAddress,
            takerTokenAddress,
            signedOrder.feeRecipientAddress,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [
            signedOrder.makerAssetAmount,
            signedOrder.takerAssetAmount,
            signedOrder.makerFee,
            signedOrder.takerFee,
            signedOrder.expirationTimeSeconds,
            signedOrder.salt,
            fillQuantity,
            0,
          ],
          [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
          '0x0',
          signedOrder.signature,
        ],
        defaultTxOpts
      );

      postFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );
      postFundHoldingsZrx = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [zrx.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
      expect(postFundHoldingsZrx).bigNumberEq(
        preFundHoldingsZrx.sub(new BN(signedOrder.takerFee))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.exchangeAddress).toBe(zeroExExchange.options.address);
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAmounts[0]).toBe(signedOrder.takerFee);
    });
  });
});
