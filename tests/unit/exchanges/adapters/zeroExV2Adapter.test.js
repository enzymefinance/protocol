/*
 * @file Unit tests for vault via the ZeroExV2Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: full amount w/ takerFee
 * @test takeOrder: Order 3: partial amount w/ takerFee
 */

import { BN, toWei, randomHex } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/utils/zeroExV2';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, zrx, weth;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ZRX, web3, mainnetAddrs.tokens.ZRX);
  erc20Proxy = getDeployed(CONTRACT_NAMES.IERC20, web3, mainnetAddrs.zeroExV2.ZeroExV2ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER, web3);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE_INTERFACE, web3, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
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
        },
        web3
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts,
        web3
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer,
        web3
      );

      expect(signatureValid).toBeTruthy();
    });

    it('does not allow taker fill amount greater than order max', async () => {
      const { vault } = fund;
      const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, badFillQuantity, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible('taker fill amount greater than max order quantity');
    });
  });

  describe('Fill Order 1: no fees', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
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
        },
        web3
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts,
        web3
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer,
        web3
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity, web3);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
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
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  // @dev Uses ZRX as maker asset so that fees can be deducted from the maker amount
  describe('Fill Order 2: w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFee;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let preFundHoldingsZrx, postFundHoldingsZrx;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = zrx.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;
      takerFee = toWei('0.001', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          feeRecipientAddress: investor,
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          takerFee,
        },
        web3
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer,
        web3
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity, web3);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsZrx).bigNumberEq(
        preFundHoldingsZrx
          .add(new BN(signedOrder.makerAssetAmount))
          .sub(new BN(signedOrder.takerFee))
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

  // @dev Uses ZRX as maker asset so that fees can be deducted from the maker amount
  describe('Fill Order 3: partial fill w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee;
    let makerFillQuantity, takerFillQuantity, takerFeeFillQuantity;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let preFundHoldingsZrx, postFundHoldingsZrx;
    let tx;

    beforeAll(async () => {
      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        web3
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = zrx.options.address;
      takerTokenAddress = weth.options.address;
      takerFee = toWei('0.001', 'ether');


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
        web3
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer,
        web3
      );

      expect(signatureValid).toBeTruthy();
    });

    test('half of the order is filled through the fund', async () => {
      const { vault } = fund;
      const partialFillDivisor = new BN(2);
      takerFillQuantity = new BN(signedOrder.takerAssetAmount).div(partialFillDivisor);
      makerFillQuantity = new BN(signedOrder.makerAssetAmount).div(partialFillDivisor);
      takerFeeFillQuantity = new BN(signedOrder.takerFee).div(partialFillDivisor);

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerFillQuantity.toString(), web3);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(preFundHoldingsWeth.sub(takerFillQuantity));
      expect(postFundHoldingsZrx).bigNumberEq(
        preFundHoldingsZrx.add(makerFillQuantity).sub(takerFeeFillQuantity)
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
