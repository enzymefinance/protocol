/*
 * @file Unit tests for trading via the ZeroExV3Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount w/ protocolFee
 * @test takeOrder: Order 2: full amount w/ protocolFee, w/ WETH takerFee
 * TODO: takeOrder: Order: full amount w/ protocolFee, w/ MLN takerFee
 * TODO: takeOrder: Order: full amount w/ protocolFee, w/ DAI takerFee
 * TODO: takeOrder: Order: full amount w/ no fees
 * TODO: takeOrder: Order: partial amount w/ takerFee and protocolFee
 */

import { assetDataUtils } from '@0x/order-utils';
import { BN, toWei, randomHex } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { createUnsignedZeroExOrder, signZeroExOrder } from '~/tests/utils/zeroExV3';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, zrx, weth;
let priceSource;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund;
let takeOrderSignature;
let exchangeIndex;
let protocolFeeAmount, chainId;

beforeAll(async () => {
  // @dev Set gas price explicitly for consistently calculating 0x v3's protocol fee
  const gasPrice = toWei('2', 'gwei');
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  
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

  erc20Proxy = contracts[CONTRACT_NAMES.ZERO_EX_V3_ERC20_PROXY];  
  zeroExAdapter = contracts[CONTRACT_NAMES.ZERO_EX_V3_ADAPTER];
  zeroExExchange = contracts[CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE];

  const protocolFeeMultiplier = new BN(
    await call(zeroExExchange, 'protocolFeeMultiplier')
  );
  protocolFeeAmount = protocolFeeMultiplier.mul(new BN(gasPrice));
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
              signedOrder.makerAddress,
              signedOrder.takerAddress,
              badTokenAddress,
              takerTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              takerFeeTokenAddress,
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
            [
                signedOrder.makerAssetData,
                signedOrder.takerAssetData,
                signedOrder.makerFeeAssetData,
                signedOrder.takerFeeAssetData
            ],
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
              signedOrder.makerAddress,
              signedOrder.takerAddress,
              makerTokenAddress,
              badTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              takerFeeTokenAddress
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
            [
                signedOrder.makerAssetData,
                signedOrder.takerAssetData,
                signedOrder.makerFeeAssetData,
                signedOrder.takerFeeAssetData
            ],
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
              signedOrder.makerAddress,
              signedOrder.takerAddress,
              makerTokenAddress,
              takerTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              takerFeeTokenAddress
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
            [
                signedOrder.makerAssetData,
                signedOrder.takerAssetData,
                signedOrder.makerFeeAssetData,
                signedOrder.takerFeeAssetData
            ],
            '0x0',
            signedOrder.signature,
          ],
          defaultTxOpts
        )
      ).rejects.toThrowFlexible("taker fill amount greater than max order quantity");
    });

    it('does not allow different taker fee asset address and takerFeeAssetData', async () => {
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
              signedOrder.makerAddress,
              signedOrder.takerAddress,
              makerTokenAddress,
              takerTokenAddress,
              signedOrder.feeRecipientAddress,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              badTokenAddress
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
            [
              signedOrder.makerAssetData,
              signedOrder.takerAssetData,
              signedOrder.makerFeeAssetData,
              signedOrder.takerFeeAssetData
            ],
            '0x0',
            signedOrder.signature,
          ],
          defaultTxOpts
        )
      ).rejects.toThrowFlexible("takerFeeAssetData does not match address");
    });
  });

  describe('Fill Order 1: Full taker amount w/ protocol fee, w/o taker fee', () => {
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
      const { accounting, trading } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

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
            signedOrder.makerAddress,
            signedOrder.takerAddress,
            makerTokenAddress,
            takerTokenAddress,
            signedOrder.feeRecipientAddress,
            EMPTY_ADDRESS,
            makerFeeAsset,
            takerFeeAsset
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
          [
            signedOrder.makerAssetData,
            signedOrder.takerAssetData,
            signedOrder.makerFeeAssetData,
            signedOrder.takerFeeAssetData
          ],
          '0x0',
          signedOrder.signature,
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
      expect(orderFilled.exchangeAddress).toBe(zeroExExchange.options.address);
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

  describe('Fill Order 2: Full amount, w/ protocol fee, w/ taker fee in weth', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFee, takerFeeTokenAddress;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
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
      const feeRecipientAddress = randomHex(20);
      const takerFee = toWei('0.001', 'ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      takerFeeTokenAddress = weth.options.address;
  
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
      const { accounting, trading } = fund;

      const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
      const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
        EMPTY_ADDRESS :
        assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

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
            signedOrder.makerAddress,
            signedOrder.takerAddress,
            makerTokenAddress,
            takerTokenAddress,
            signedOrder.feeRecipientAddress,
            EMPTY_ADDRESS,
            makerFeeAsset,
            takerFeeAsset
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
          [
            signedOrder.makerAssetData,
            signedOrder.takerAssetData,
            signedOrder.makerFeeAssetData,
            signedOrder.takerFeeAssetData
          ],
          '0x0',
          signedOrder.signature,
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
      expect(orderFilled.exchangeAddress).toBe(zeroExExchange.options.address);
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(
        new BN(signedOrder.takerFee).add(protocolFeeAmount)
      );
    });
  });
});
