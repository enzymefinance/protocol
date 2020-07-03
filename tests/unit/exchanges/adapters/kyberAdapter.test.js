/*
 * @file Unit tests for vault via the KyberAdapter
 *
 * @test takeOrder: Order 1: eth to token
 * @test takeOrder: Order 2: token to eth
 * @test takeOrder: Order 3: token to token
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import {
  CALL_ON_INTEGRATION_ENCODING_TYPES,
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS,
} from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager;
let managerTxOpts;
let dai, mln, weth;
let kyberAdapter, kyberNetworkProxy;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.KYBER_ADAPTER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_INTERFACE, mainnetAddrs.kyber.KyberNetworkProxy);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
});

describe('takeOrder', () => {
  describe('Fill Order 1: eth to token', () => {
    let incomingAsset, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount;
    let tx;

    beforeAll(async () => {
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      incomingAsset = mln.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [KYBER_ETH_ADDRESS, incomingAsset, outgoingAssetAmount],
      );

      expectedIncomingAssetAmount = BNExpMul(
        new BN(outgoingAssetAmount.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
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

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          incomingAsset, // incoming asset
          expectedIncomingAssetAmount, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(kyberAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(incomingAsset);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(expectedIncomingAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(outgoingAsset);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(outgoingAssetAmount);
    });
  });

  // @dev Set denomination asset to MLN to allow investment in MLN
  describe('Fill Order 2: token to eth', () => {
    let incomingAsset, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount;
    let tx;

    beforeAll(async () => {
      outgoingAsset = mln.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      incomingAsset = weth.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [outgoingAsset, KYBER_ETH_ADDRESS, outgoingAssetAmount],
      );

      expectedIncomingAssetAmount = BNExpMul(
        new BN(outgoingAssetAmount.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        manager,
        fundFactory
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          incomingAsset, // incoming asset
          expectedIncomingAssetAmount, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(kyberAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(incomingAsset);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(expectedIncomingAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(outgoingAsset);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(outgoingAssetAmount);
    });
  });

  // @dev Set denomination asset to MLN to allow investment in MLN
  describe('Fill Order 3: token to token', () => {
    let incomingAsset, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount;
    let tx;

    beforeAll(async () => {
      outgoingAsset = mln.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      incomingAsset = dai.options.address;

      const { 0: expectedRate } = await call(
        kyberNetworkProxy,
        'getExpectedRate',
        [outgoingAsset, incomingAsset, outgoingAssetAmount],
      );

      expectedIncomingAssetAmount = BNExpMul(
        new BN(outgoingAssetAmount.toString()),
        new BN(expectedRate.toString()),
      ).toString();

      fund = await setupFundWithParams({
        integrationAdapters: [kyberAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          incomingAsset, // incoming asset
          expectedIncomingAssetAmount, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(kyberAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(incomingAsset);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(expectedIncomingAssetAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(outgoingAsset);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(outgoingAssetAmount);
    });
  });
});
