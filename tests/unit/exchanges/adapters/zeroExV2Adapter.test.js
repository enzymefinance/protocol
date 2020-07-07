/*
 * @file Unit tests for vault via the ZeroExV2Adapter
 *
 * @test takeOrder: Bad order: too high fill amount
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: full amount w/ takerFee
 * @test takeOrder: Order 3: partial amount w/ takerFee
 */

import { BN, toWei, randomHex } from 'web3-utils';
import { send } from '~/utils/deploy-contract';
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

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, zrx, weth;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  erc20Proxy = getDeployed(CONTRACT_NAMES.IERC20, mainnetAddrs.zeroExV2.ZeroExV2ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE_INTERFACE, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
});

describe('takeOrder', () => {
  describe('Bad order: too high fill amount', () => {
    let signedOrder;
    let takerAssetAmount;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        fundFactory,
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor,
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
        {
          makerAddress: deployer,
          makerTokenAddress: mln.options.address,
          makerAssetAmount,
          takerTokenAddress: weth.options.address,
          takerAssetAmount,
        }
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
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
      ).rejects.toThrowFlexible('Taker asset fill amount greater than available');
    });
  });

  describe('Fill Order 1: full fill, no fees', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount;
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
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        }
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
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

  // @dev Uses ZRX as maker asset so that fees can be deducted from the maker amount
  describe('Fill Order 2: full fill, w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFee;
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
        manager
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      makerTokenAddress = zrx.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFee = toWei('0.001', 'ether');

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          feeRecipientAddress: investor,
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          takerFee,
        }
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
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
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerAssetAmount);
    });
  });

  // @dev Uses ZRX as maker asset so that fees can be deducted from the maker amount
  describe('Fill Order 3: partial fill w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, takerFee;
    let makerTokenAddress, makerAssetAmount, takerTokenAddress, takerAssetAmount, takerFee;
    let takerAssetFillAmount, expectedMakerAssetFillAmount, expectedTakerFeeFillAmount;
    let tx;

    beforeAll(async () => {
      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
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
      makerTokenAddress = zrx.options.address;
      makerAssetAmount = toWei('1', 'Ether');
      takerTokenAddress = weth.options.address;
      takerAssetAmount = toWei('0.05', 'Ether');
      takerFee = toWei('0.001', 'ether');


      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress: deployer,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          takerFee,
          feeRecipientAddress: randomHex(20),
        }
      );

      await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );

      expect(signatureValid).toBeTruthy();
    });

    test('half of the order is filled through the fund', async () => {
      const { vault } = fund;
      const partialFillDivisor = new BN(2);
      takerAssetFillAmount = new BN(takerAssetAmount).div(partialFillDivisor).toString();
      expectedMakerAssetFillAmount = new BN(makerAssetAmount).div(partialFillDivisor).toString();
      expectedTakerFeeFillAmount = new BN(takerFee).div(partialFillDivisor).toString();

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerAssetFillAmount);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts
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
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerAssetFillAmount);
    });
  });
});
