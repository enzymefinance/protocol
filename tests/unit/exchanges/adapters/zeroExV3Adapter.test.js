/*
 * @file Unit tests for vault via the ZeroExV3Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount w/ protocolFee
 * @test takeOrder: Order 2: full amount w/ protocolFee, w/ WETH takerFee
 * @test takeOrder: Order: full amount w/ protocolFee, w/ MLN takerFee
 * TODO: takeOrder: Order: full amount w/ protocolFee, w/ DAI takerFee
 * TODO: takeOrder: Order: full amount w/ no fees
 * TODO: takeOrder: Order: partial amount w/ takerFee and protocolFee
 */

import { assetDataUtils } from '@0x/order-utils';
import { BN, toWei, randomHex } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  signZeroExOrder
} from '~/tests/utils/zeroExV3';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, weth;
let priceSource;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund;
let takeOrderSignature;
let defaultProtocolFeeMultiplier, protocolFeeAmount, chainId;

beforeAll(async () => {
  // @dev Set gas price explicitly for consistently calculating 0x v3's protocol fee
  const gasPrice = toWei('2', 'gwei');
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;
  dai = contracts.DAI;

  priceSource = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];

  erc20Proxy = contracts[CONTRACT_NAMES.ZERO_EX_V3_ERC20_PROXY];
  zeroExAdapter = contracts[CONTRACT_NAMES.ZERO_EX_V3_ADAPTER];
  zeroExExchange = contracts[CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE];

  defaultProtocolFeeMultiplier = await call(zeroExExchange, 'protocolFeeMultiplier');
  protocolFeeAmount = new BN(defaultProtocolFeeMultiplier).mul(new BN(gasPrice));
  chainId = await web3.eth.net.getId();
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFeeTokenAddress;
    let badTokenAddress;

    beforeAll(async () => {
      // Set up fund
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        quoteToken: weth.options.address,
        fundFactory
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      const takerFee = toWei('0.001', 'ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      takerFeeTokenAddress = weth.options.address;
      badTokenAddress = dai.options.address;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress,
          takerFee,
          takerFeeTokenAddress
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    it('does not allow taker fill amount greater than order max', async () => {
      const { vault } = fund;
      const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, badFillQuantity);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("taker fill amount greater than max order quantity");
    });
  });

  describe('Fill Order 1: Full taker amount w/ protocol fee, w/o taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
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
        chainId,
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
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount)).sub(protocolFeeAmount)
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAssets[0]).toBe(weth.options.address);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(orderFilled.feeAmounts[0]).toBe(protocolFeeAmount.toString());
    });
  });

  describe('Fill Order 2: Full amount, w/ protocol fee (taker asset), w/ taker fee in weth (taker asset)', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      const takerFee = toWei('0.001', 'ether');
      const takerFeeTokenAddress = weth.options.address;
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress,
          takerFee,
          takerFeeTokenAddress
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        preFundHoldingsWeth
          .sub(new BN(signedOrder.takerAssetAmount))
          .sub(protocolFeeAmount)
          .sub(new BN(signedOrder.takerFee))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAssets[0]).toBe(weth.options.address);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(
        new BN(signedOrder.takerFee).add(protocolFeeAmount)
      );
    });
  });

  describe('Fill Order 3: Full amount, w/ protocol fee (taker asset), w/ taker fee in mln (maker asset)', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee, takerFeeTokenAddress, fillQuantity;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      takerFeeTokenAddress = mln.options.address;
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      takerFee = toWei('0.01', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress,
          takerFee,
          takerFeeTokenAddress
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        preFundHoldingsWeth
          .sub(new BN(signedOrder.takerAssetAmount))
          .sub(protocolFeeAmount)
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln
          .add(new BN(signedOrder.makerAssetAmount))
          .sub(new BN(signedOrder.takerFee))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(2);
      expect(orderFilled.feeAssets[0]).toBe(weth.options.address);
      expect(orderFilled.feeAssets[1]).toBe(takerFeeTokenAddress);
      expect(orderFilled.feeAmounts.length).toBe(2);
      expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(protocolFeeAmount);
      expect(orderFilled.feeAmounts[1]).toBe(signedOrder.takerFee);
    });
  });

  describe('Fill Order 4: Full amount, NO protocol fee, w/ taker fee in dai (3rd asset)', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee, takerFeeTokenAddress, fillQuantity;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let preFundHoldingsDai, postFundHoldingsDai;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      // Set protocolFeeMultiplier to 0
      await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], defaultTxOpts);
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        defaultTxOpts
      );
    });

    test('third party makes and fund takes an order for DAI (to be used as fees)', async () => {
      const { vault } = fund;

      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.005', 'Ether');
      const makerTokenAddress = dai.options.address;
      const takerTokenAddress = weth.options.address;
      const fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        },
      );

      await send(dai, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);
      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).resolves.not.toThrow();
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      takerFeeTokenAddress = dai.options.address;
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      takerFee = toWei('1', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress,
          takerFee,
          takerFeeTokenAddress
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
      preFundHoldingsDai = new BN(
        await call(vault, 'assetBalances', [dai.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
      postFundHoldingsDai = new BN(
        await call(vault, 'assetBalances', [dai.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
      expect(postFundHoldingsDai).bigNumberEq(
        preFundHoldingsDai.sub(new BN(signedOrder.takerFee))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAssets[0]).toBe(takerFeeTokenAddress);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(orderFilled.feeAmounts[0]).toBe(signedOrder.takerFee);
    });
  });

  describe('Fill Order 5: Full amount, NO protocol fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      // Set protocolFeeMultiplier to 0
      await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], defaultTxOpts);
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        defaultTxOpts
      );
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
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 6: Partial amount, w/ protocol fee (taker asset), w/ taker fee in mln (maker asset)', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee, takerFeeTokenAddress, fillQuantity;
    let makerFillQuantity, takerFillQuantity, takerFeeFillQuantity;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      // Re-deploy FundFactory contract only
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);

      // Set up fund
      const fundFactory = deployed.contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      const takerFee = toWei('0.001', 'ether');
      takerFeeTokenAddress = mln.options.address;
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress,
          takerFee,
          takerFeeTokenAddress
        },
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('half of the order is filled through the fund', async () => {
      const { vault } = fund;
      const partialFillDivisor = new BN(2);
      takerFillQuantity = new BN(signedOrder.takerAssetAmount).div(partialFillDivisor);
      makerFillQuantity = new BN(signedOrder.makerAssetAmount).div(partialFillDivisor);
      takerFeeFillQuantity = new BN(signedOrder.takerFee).div(partialFillDivisor);

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerFillQuantity.toString());

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        preFundHoldingsWeth.sub(takerFillQuantity).sub(protocolFeeAmount)
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(makerFillQuantity).sub(takerFeeFillQuantity)
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(new BN(orderFilled.buyAmount)).bigNumberEq(makerFillQuantity);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(new BN(orderFilled.sellAmount)).bigNumberEq(takerFillQuantity);
      expect(orderFilled.feeAssets.length).toBe(2);
      expect(orderFilled.feeAssets[0]).toBe(weth.options.address);
      expect(orderFilled.feeAssets[1]).toBe(takerFeeTokenAddress);
      expect(orderFilled.feeAmounts.length).toBe(2);
      expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(protocolFeeAmount);
      expect(new BN(orderFilled.feeAmounts[1])).bigNumberEq(takerFeeFillQuantity);
    });
  });
});
