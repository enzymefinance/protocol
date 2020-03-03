/*
 * @file Unit tests for trading via the ZeroExV2Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: full amount w/ takerFee
 * @test takeOrder: Order 3: partial amount w/ takerFee
 */

import { BN, toWei, randomHex } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
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

    it('does not allow taker fill amount greater than order max', async () => {
      const { trading } = fund;
      const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      const orderAddresses = [];
      const orderValues = [];
      const orderData = [];

      orderAddresses[0] = signedOrder.makerAddress;
      orderAddresses[1] = signedOrder.takerAddress;
      orderAddresses[2] = signedOrder.feeRecipientAddress;
      orderAddresses[3] = signedOrder.senderAddress;
      orderValues[0] = signedOrder.makerAssetAmount;
      orderValues[1] = signedOrder.takerAssetAmount;
      orderValues[2] = signedOrder.makerFee;
      orderValues[3] = signedOrder.takerFee;
      orderValues[4] = signedOrder.expirationTimeSeconds;
      orderValues[5] = signedOrder.salt;
      orderValues[6] = badFillQuantity;
      orderData[0] =  signedOrder.makerAssetData;
      orderData[1] = signedOrder.takerAssetData;

      const hex = web3.eth.abi.encodeParameters(
        ['address[4]', 'uint256[7]', 'bytes[2]', 'bytes'],
        [orderAddresses, orderValues, orderData, signedOrder.signature],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            '0x0',
            encodedArgs,
          ],
          defaultTxOpts,
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

      const orderAddresses = [];
      const orderValues = [];
      const orderData = [];

      orderAddresses[0] = signedOrder.makerAddress;
      orderAddresses[1] = signedOrder.takerAddress;
      orderAddresses[2] = signedOrder.feeRecipientAddress;
      orderAddresses[3] = signedOrder.senderAddress;
      orderValues[0] = signedOrder.makerAssetAmount;
      orderValues[1] = signedOrder.takerAssetAmount;
      orderValues[2] = signedOrder.makerFee;
      orderValues[3] = signedOrder.takerFee;
      orderValues[4] = signedOrder.expirationTimeSeconds;
      orderValues[5] = signedOrder.salt;
      orderValues[6] = fillQuantity;
      orderData[0] =  signedOrder.makerAssetData;
      orderData[1] = signedOrder.takerAssetData;

      const hex = web3.eth.abi.encodeParameters(
        ['address[4]', 'uint256[7]', 'bytes[2]', 'bytes'],
        [orderAddresses, orderValues, orderData, signedOrder.signature],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
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

      const orderAddresses = [];
      const orderValues = [];
      const orderData = [];

      orderAddresses[0] = signedOrder.makerAddress;
      orderAddresses[1] = signedOrder.takerAddress;
      orderAddresses[2] = signedOrder.feeRecipientAddress;
      orderAddresses[3] = signedOrder.senderAddress;
      orderValues[0] = signedOrder.makerAssetAmount;
      orderValues[1] = signedOrder.takerAssetAmount;
      orderValues[2] = signedOrder.makerFee;
      orderValues[3] = signedOrder.takerFee;
      orderValues[4] = signedOrder.expirationTimeSeconds;
      orderValues[5] = signedOrder.salt;
      orderValues[6] = fillQuantity;
      orderData[0] =  signedOrder.makerAssetData;
      orderData[1] = signedOrder.takerAssetData;

      const hex = web3.eth.abi.encodeParameters(
        ['address[4]', 'uint256[7]', 'bytes[2]', 'bytes'],
        [orderAddresses, orderValues, orderData, signedOrder.signature],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
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
      expect(orderFilled.feeAssets[0]).toBe(zrx.options.address);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(orderFilled.feeAmounts[0]).toBe(signedOrder.takerFee);
    });
  });

  describe('Fill Order 3: partial fill w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee;
    let makerFillQuantity, takerFillQuantity, takerFeeFillQuantity;
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

    test('half of the order is filled through the fund', async () => {
      const { accounting, trading } = fund;
      const partialFillDivisor = new BN(2);
      takerFillQuantity = new BN(signedOrder.takerAssetAmount).div(partialFillDivisor);
      makerFillQuantity = new BN(signedOrder.makerAssetAmount).div(partialFillDivisor);
      takerFeeFillQuantity = new BN(signedOrder.takerFee).div(partialFillDivisor);

      preFundHoldingsWeth = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
      );
      preFundHoldingsZrx = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [zrx.options.address])
      );

      const orderAddresses = [];
      const orderValues = [];
      const orderData = [];

      orderAddresses[0] = signedOrder.makerAddress;
      orderAddresses[1] = signedOrder.takerAddress;
      orderAddresses[2] = signedOrder.feeRecipientAddress;
      orderAddresses[3] = signedOrder.senderAddress;
      orderValues[0] = signedOrder.makerAssetAmount;
      orderValues[1] = signedOrder.takerAssetAmount;
      orderValues[2] = signedOrder.makerFee;
      orderValues[3] = signedOrder.takerFee;
      orderValues[4] = signedOrder.expirationTimeSeconds;
      orderValues[5] = signedOrder.salt;
      orderValues[6] = takerFillQuantity.toString();
      orderData[0] =  signedOrder.makerAssetData;
      orderData[1] = signedOrder.takerAssetData;

      const hex = web3.eth.abi.encodeParameters(
        ['address[4]', 'uint256[7]', 'bytes[2]', 'bytes'],
        [orderAddresses, orderValues, orderData, signedOrder.signature],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      tx = await send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
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
      postFundHoldingsZrx = new BN(
        await call(accounting, 'getFundHoldingsForAsset', [zrx.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(preFundHoldingsWeth.sub(takerFillQuantity));
      expect(postFundHoldingsMln).bigNumberEq(preFundHoldingsMln.add(makerFillQuantity));
      expect(postFundHoldingsZrx).bigNumberEq(preFundHoldingsZrx.sub(takerFeeFillQuantity));
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
      expect(new BN(orderFilled.buyAmount)).bigNumberEq(makerFillQuantity);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(new BN(orderFilled.sellAmount)).bigNumberEq(takerFillQuantity);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAssets[0]).toBe(zrx.options.address);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(takerFeeFillQuantity);
    });
  });
});
