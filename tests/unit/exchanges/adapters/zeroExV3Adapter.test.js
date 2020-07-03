/*
 * @file Unit tests for vault via the ZeroExV3Adapter
 *
 * @test takeOrder: Bad order: too high fill amount
 * @test takeOrder: Order 1: full amount w/ protocolFee (taker asset)
 * @test takeOrder: Order 2: full amount w/ protocolFee (taker asset), w/ takerFee (taker asset)
 * @test takeOrder: Order 3: full amount w/ protocolFee (taker asset), w/ takerFee (maker asset)
 * @test takeOrder: Order 4: full amount w/o protocolFee, w/ ZRX takerFee (new asset)
 * @test takeOrder: Order 5: full amount w/ no fees
 * @test takeOrder: Order 6: partial amount w/ protocolFee (taker asset), w/ takerFee (maker asset)
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
    CONTRACT_NAMES.ZERO_EX_V3_ADAPTER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  erc20Proxy = getDeployed(CONTRACT_NAMES.IERC20, mainnetAddrs.zeroExV3.ZeroExV3ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_EXCHANGE_INTERFACE, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  defaultProtocolFeeMultiplier = await call(zeroExExchange, 'protocolFeeMultiplier');
  protocolFeeAmount = new BN(defaultProtocolFeeMultiplier).mul(new BN(gasPrice));
  chainId = await web3.eth.net.getId();
});

describe('takeOrder', () => {
  describe('Bad order: too high fill amount', () => {
    let takerAssetAmount;
    let signedOrder;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        fundFactory,
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        integrationAdapters: [zeroExAdapter.options.address],
        manager,
        quoteToken: weth.options.address
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAssetAmount = toWei('1', 'Ether');
      takerAssetAmount = toWei('0.05', 'Ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress: mln.options.address,
          makerAssetAmount,
          takerTokenAddress: weth.options.address,
          takerAssetAmount,
        }
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
      const tooHighTakerFillAmount = new BN(takerAssetAmount).add(new BN(1)).toString();

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, tooHighTakerFillAmount);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible("Taker asset fill amount greater than available");
    });
  });

  describe('Fill Order 1: Full taker amount w/ protocol fee (taker asset), w/o taker fee', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount;
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
        manager
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        }
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(makerAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.outgoingAssetAmounts[0])).bigNumberEq(
        new BN(takerAssetAmount).add(protocolFeeAmount)
      );
    });
  });

  describe('Fill Order 2: Full amount, w/ protocol fee (taker asset), w/ taker fee in weth (taker asset)', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFeeTokenAddress, takerFee;
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
        manager
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFeeTokenAddress = weth.options.address;
      takerFee = toWei('0.001', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress: randomHex(20),
          takerFee: takerFee,
          takerFeeTokenAddress
        }
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(makerAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.outgoingAssetAmounts[0])).bigNumberEq(
        new BN(takerAssetAmount).add(protocolFeeAmount).add(new BN(takerFee))
      );
    });
  });

  describe('Fill Order 3: Full amount, w/ protocol fee (taker asset), w/ taker fee in mln (maker asset)', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFeeTokenAddress, takerFee;
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
        manager
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFeeTokenAddress = mln.options.address;
      takerFee = toWei('0.01', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress: randomHex(20),
          takerFee,
          takerFeeTokenAddress
        }
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.incomingAssetAmounts[0])).bigNumberEq(
        new BN(makerAssetAmount).sub(new BN(takerFee))
      );
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.outgoingAssetAmounts[0])).bigNumberEq(
        new BN(takerAssetAmount).add(protocolFeeAmount)
      );
    });
  });

  describe('Fill Order 4: Full amount, NO protocol fee, w/ taker fee in zrx (3rd asset)', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFeeTokenAddress, takerFee;
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
        manager
      });

      // Set protocolFeeMultiplier to 0
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [0],
        governorTxOpts
      );
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        governorTxOpts
      );
    });

    test('third party makes and fund takes an order for ZRX (to be used as fees)', async () => {
      const { vault } = fund;

      const makerAssetAmount = toWei('0.01', 'Ether');
      const takerAssetAmount = toWei('0.005', 'Ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress: zrx.options.address,
          makerAssetAmount,
          takerTokenAddress: weth.options.address,
          takerAssetAmount,
        }
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);
      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFeeTokenAddress = zrx.options.address;
      takerFee = toWei('0.01', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress: randomHex(20),
          takerFee,
          takerFeeTokenAddress
        }
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts
      );
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(makerAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(2);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssets[1]).toBe(takerFeeTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(2);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerAssetAmount);
      expect(coiExecuted.outgoingAssetAmounts[1]).toBe(takerFee);
    });
  });

  describe('Fill Order 5: Full amount, NO protocol fee', () => {
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount;
    let signedOrder;    
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
        manager
      });

      // Set protocolFeeMultiplier to 0
      await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], governorTxOpts);
    });

    afterAll(async () => {
      // Reset protocolFeeMultiplier to default
      await send(
        zeroExExchange,
        'setProtocolFeeMultiplier',
        [defaultProtocolFeeMultiplier],
        governorTxOpts
      );
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount
        }
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

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(makerAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerAssetAmount);
    });
  });

  describe('Fill Order 6: Partial amount, w/ protocol fee (taker asset), w/ taker fee in mln (maker asset)', () => {
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFeeTokenAddress, takerFee;
    let takerAssetFillAmount, expectedMakerAssetFillAmount, expectedTakerFeeFillAmount;
    let signedOrder;
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
        manager
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = mln.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFeeTokenAddress = mln.options.address;
      takerFee = toWei('0.001', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        chainId,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          feeRecipientAddress: randomHex(20),
          takerFee,
          takerFeeTokenAddress
        }
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
      takerAssetFillAmount = new BN(signedOrder.takerAssetAmount).div(partialFillDivisor);
      expectedMakerAssetFillAmount = new BN(signedOrder.makerAssetAmount).div(partialFillDivisor);
      expectedTakerFeeFillAmount = new BN(signedOrder.takerFee).div(partialFillDivisor);

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetFillAmount.toString());

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      );
    });

    it('emits correct CallOnIntegrationExecuted event', async () => {
      const coiExecutedCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );
      expect(coiExecutedCount).toBe(1);

      const coiExecuted = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.VAULT,
        'CallOnIntegrationExecuted'
      );

      expect(coiExecuted.adapter).toBe(zeroExAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerTokenAddress);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.incomingAssetAmounts[0])).bigNumberEq(
        new BN(expectedMakerAssetFillAmount).sub(new BN(expectedTakerFeeFillAmount))
      );
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerTokenAddress);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(new BN(coiExecuted.outgoingAssetAmounts[0])).bigNumberEq(
        new BN(takerAssetFillAmount).add(protocolFeeAmount)
      );
    });
  });
});
