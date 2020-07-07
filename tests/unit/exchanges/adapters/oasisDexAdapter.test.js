/*
 * @file Unit tests for vault via the OasisDexAdapter
 *
 * @test takeOrder: Bad order: too high fill amount
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: partial amount
 */

import { BN, hexToNumber, toWei } from 'web3-utils';
import { send } from '~/utils/deploy-contract';
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
let defaultTxOpts, managerTxOpts;
let dai, mln, weth;
let oasisDexAdapter, oasisDexExchange;
let fund, fundFactory;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.DAI);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER);
  oasisDexExchange = getDeployed(CONTRACT_NAMES.OASIS_DEX_EXCHANGE, mainnetAddrs.oasis.OasisDexExchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.OASIS_DEX_ADAPTER,
    'takeOrder',
  );
});

describe('takeOrder', () => {
  describe('Bad fill order: too high fill amount', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let orderId;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      fund = await setupFundWithParams({
        fundFactory,
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        integrationAdapters: [oasisDexAdapter.options.address],
        manager,
        quoteToken: weth.options.address,
      });
    });

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts
      );
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      orderId = hexToNumber(logMake.id);
    });

    it('does not allow taker fill amount greater than order max', async () => {
      const { vault } = fund;
      const tooHighOutgoingAssetAmount = new BN(takerQuantity).add(new BN(1)).toString();

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.OASIS_DEX.TAKE_ORDER,
        [
          tooHighOutgoingAssetAmount, // exact outgoing asset amount (fill amount)
          orderId // order identifier
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderSignature,
            encodedArgs
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible("Taker asset fill amount greater than available")
    });
  });

  describe('Fill Order 1: full amount', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let orderId;
    let tx;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      fund = await setupFundWithParams({
        integrationAdapters: [oasisDexAdapter.options.address],
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

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts
      );
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      orderId = hexToNumber(logMake.id);
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.OASIS_DEX.TAKE_ORDER,
        [
          takerQuantity, // exact outgoing asset amount (fill amount)
          orderId // order identifier
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          oasisDexAdapter.options.address,
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

      expect(coiExecuted.adapter).toBe(oasisDexAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerAsset);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(makerQuantity);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerAsset);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerQuantity);
    });
  });

  describe('Fill Order 2: partial amount', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let orderId;
    let takerAssetFillAmount, expectedMakerAssetFillAmount;
    let tx;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      fund = await setupFundWithParams({
        integrationAdapters: [oasisDexAdapter.options.address],
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

    test('Third party makes an order', async () => {
      await send(
        mln,
        'approve',
        [oasisDexExchange.options.address, makerQuantity],
        defaultTxOpts
      );
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          makerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      orderId = hexToNumber(logMake.id);
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;
      const partialFillDivisor = new BN(2);
      takerAssetFillAmount = new BN(takerQuantity).div(partialFillDivisor).toString();
      expectedMakerAssetFillAmount = new BN(makerQuantity).div(partialFillDivisor).toString();

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.OASIS_DEX.TAKE_ORDER,
        [
          takerAssetFillAmount, // exact outgoing asset amount (fill amount)
          orderId // order identifier
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          oasisDexAdapter.options.address,
          takeOrderSignature,
          encodedArgs
        ],
        managerTxOpts
      )
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

      expect(coiExecuted.adapter).toBe(oasisDexAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(makerAsset);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(expectedMakerAssetFillAmount);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(takerAsset);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(takerAssetFillAmount);
    });
  });
});
