/*
 * @file Unit tests for vault via the UniswapAdapter
 *
 * @test takeOrder: Order 1: eth to token
 * @test takeOrder: Order 2: token to eth
 * @test takeOrder: Order 3: token to token
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
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
let uniswapAdapter, uniswapFactory;
let mlnExchange, daiExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.UNISWAP_ADAPTER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.DAI);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER);
  uniswapFactory = getDeployed(CONTRACT_NAMES.UNISWAP_FACTORY_INTERFACE, mainnetAddrs.uniswap.UniswapFactory);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  // Load interfaces for uniswap exchanges of tokens to be traded
  const mlnExchangeAddress = await call(uniswapFactory, 'getExchange', [mln.options.address]);
  mlnExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE_INTERFACE,
    mlnExchangeAddress
  );
  const daiExchangeAddress = await call(uniswapFactory, 'getExchange', [dai.options.address]);
  daiExchange = await getDeployed(
    CONTRACT_NAMES.UNISWAP_EXCHANGE_INTERFACE,
    daiExchangeAddress
  );
});

describe('takeOrder', () => {
  describe('Fill Order 1: eth to token', () => {
    let incomingAsset, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount;
    let tx;

    beforeAll(async () => {
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      incomingAsset = mln.options.address;

      expectedIncomingAssetAmount = await call(
        mlnExchange,
        'getEthToTokenInputPrice',
        [outgoingAssetAmount]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
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
        CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
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
          uniswapAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(uniswapAdapter.options.address);
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

      expectedIncomingAssetAmount = await call(
        mlnExchange,
        'getTokenToEthInputPrice',
        [outgoingAssetAmount]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
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
        CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
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
          uniswapAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(uniswapAdapter.options.address);
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

      const intermediateEth = await call(
        mlnExchange,
        'getTokenToEthInputPrice',
        [outgoingAssetAmount]
      );
      expectedIncomingAssetAmount = await call(
        daiExchange,
        'getEthToTokenInputPrice',
        [intermediateEth]
      );

      fund = await setupFundWithParams({
        integrationAdapters: [uniswapAdapter.options.address],
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
        CALL_ON_INTEGRATION_ENCODING_TYPES.UNISWAP.TAKE_ORDER,
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
          uniswapAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(uniswapAdapter.options.address);
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
