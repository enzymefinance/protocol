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
  signZeroExOrder
} from '~/utils/zeroExV3';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager;
let defaultTxOpts, managerTxOpts, governorTxOpts;
let zrx, mln, weth;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund, fundFactory;
let takeOrderSignature;
let defaultProtocolFeeMultiplier, protocolFeeAmount, chainId;

beforeAll(async () => {
  // @dev Set gas price explicitly for consistently calculating 0x v3's protocol fee
  const gasPrice = toWei('2', 'gwei');
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  managerTxOpts = { from: manager, gas: 8000000, gasPrice };
  governorTxOpts = { from: mainnetAddrs.zeroExV3.ZeroExV3Governor, gas: 8000000 };

  // load governor with eth so it can send tx
  await web3.eth.sendTransaction({
    from: deployer,
    to: mainnetAddrs.zeroExV3.ZeroExV3Governor,
    value: toWei('1', 'ether'),
    gas: 1000000
  });

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.ZRX);
  erc20Proxy = getDeployed(CONTRACT_NAMES.IERC20, web3, mainnetAddrs.zeroExV3.ZeroExV3ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER, web3);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE_INTERFACE, web3, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  defaultProtocolFeeMultiplier = await call(zeroExExchange, 'protocolFeeMultiplier');
  protocolFeeAmount = new BN(defaultProtocolFeeMultiplier).mul(new BN(gasPrice));
  chainId = await web3.eth.net.getId();
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFeeTokenAddress;

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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
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
      ).rejects.toThrowFlexible("taker fill amount greater than max order quantity");
    });
  });

  describe('Fill Order 1: Full taker amount w/ protocol fee, w/o taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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

  describe('Fill Order 4: Full amount, NO protocol fee, w/ taker fee in zrx (3rd asset)', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee, takerFeeTokenAddress, fillQuantity;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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

      // Set protocolFeeMultiplier to 0
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [0],
        governorTxOpts,
        web3
      );
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        governorTxOpts,
        web3
      );
    });

    test('third party makes and fund takes an order for DAI (to be used as fees)', async () => {
      const { vault } = fund;

      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.005', 'Ether');
      const makerTokenAddress = zrx.options.address;
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
        web3
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity, web3);
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
      ).resolves.not.toThrow();
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      takerFeeTokenAddress = zrx.options.address;
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
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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

      // Set protocolFeeMultiplier to 0
      await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], governorTxOpts, web3);
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        governorTxOpts,
        web3
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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
      const signatureValid = await call(
        zeroExExchange,
        'isValidOrderSignature',
        [signedOrder, signedOrder.signature]
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

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
    let makerTokenAddress, takerTokenAddress, takerFeeTokenAddress;
    let makerFillQuantity, takerFillQuantity, takerFeeFillQuantity;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        integrationAdapters: [zeroExAdapter.options.address],
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

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      const feeRecipientAddress = randomHex(20);
      const takerFee = toWei('0.001', 'ether');
      takerFeeTokenAddress = mln.options.address;
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;

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
        web3
      );

      await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer, web3);
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerFillQuantity.toString(), web3);

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
