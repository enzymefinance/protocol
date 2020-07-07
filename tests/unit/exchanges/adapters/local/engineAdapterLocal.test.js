/*
 * @file Unit tests for vault via the EngineAdapter (local only)
 *
 * @dev This file contains tests that will only work locally because of EVM manipulation.
 * Input validation tests are in engineAdapter.test.js
 * All funds are denominated in MLN so that funds can receive MLN as investment
 *
 * @test takeOrder: Order 1: full amount of liquid eth
 * @test takeOrder: Order 2: arbitrary amount of liquid eth
 * @test takeOrder: Order 3: greater amount of liquid eth than full amount
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv } from '~/utils/BNmath';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/utils/metadata';
import { increaseTime } from '~/utils/rpc';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager;
let defaultTxOpts, managerTxOpts;
let mln, weth;
let engine;
let engineAdapter;
let fund, fundFactory;
let takeOrderSignature;
let mlnPrice;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ENGINE_ADAPTER,
    'takeOrder',
  );
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  engine = getDeployed(CONTRACT_NAMES.ENGINE);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
});

describe('takeOrder', () => {
  describe('Fill Order 1: full amount of liquid eth', () => {
    let mlnQuantity, wethQuantity;
    let tx;

    beforeAll(async () => {
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });

      mlnPrice = new BN(await call(engine, 'enginePrice'));

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw', [], defaultTxOpts);

      // Get expected quantities based on liquid eth
      wethQuantity = await call(engine, 'liquidEther');
      mlnQuantity = BNExpDiv(
        new BN(wethQuantity),
        new BN(mlnPrice)
      ).toString();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
        [
          wethQuantity, // min incoming asset (WETH) amount
          mlnQuantity // exact outgoing asset (MLN) amount
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          engineAdapter.options.address,
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
      
      expect(coiExecuted.adapter).toBe(engineAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(weth.options.address);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(wethQuantity);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(mln.options.address);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(mlnQuantity);
    });
  });

  describe('Fill Order 2: arbitrary amount (half) of liquid eth', () => {
    let mlnQuantity, wethQuantity;
    let tx;

    beforeAll(async () => {
      // Set amgu price
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw', [], {});

      // Get expected quantities based on liquid eth
      wethQuantity = new BN(await call(engine, 'liquidEther')).div(new BN(2)).toString();
      mlnQuantity = BNExpDiv(
        new BN(wethQuantity),
        new BN(mlnPrice)
      ).toString();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
        [
          wethQuantity, // min incoming asset (WETH) amount
          mlnQuantity // exact outgoing asset (MLN) amount
        ]
      );

      tx = await send(
        vault,
        'callOnIntegration',
        [
          engineAdapter.options.address,
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
      
      expect(coiExecuted.adapter).toBe(engineAdapter.options.address);
      expect(coiExecuted.incomingAssets.length).toBe(1);
      expect(coiExecuted.incomingAssets[0]).toBe(weth.options.address);
      expect(coiExecuted.incomingAssetAmounts.length).toBe(1);
      expect(coiExecuted.incomingAssetAmounts[0]).toBe(wethQuantity);
      expect(coiExecuted.outgoingAssets.length).toBe(1);
      expect(coiExecuted.outgoingAssets[0]).toBe(mln.options.address);
      expect(coiExecuted.outgoingAssetAmounts.length).toBe(1);
      expect(coiExecuted.outgoingAssetAmounts[0]).toBe(mlnQuantity);
    });
  });

  describe('Fill Order 3: more mln than total available liquid eth', () => {
    let mlnQuantity, wethQuantity;

    beforeAll(async () => {
      // Set amgu price
      await send(engine, 'setAmguPrice', [toWei('1', 'gwei')], defaultTxOpts);

      const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
      fund = await setupFundWithParams({
        amguTxValue: toWei('1', 'ether'),
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('100', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory,
        manager
      });

      // Thaw frozen eth from fund setup
      await increaseTime(86400 * 32);
      await send(engine, 'thaw', [], {});

      // Get expected quantities based on liquid eth
      wethQuantity = await call(engine, 'liquidEther');
      mlnQuantity = BNExpDiv(
        new BN(wethQuantity),
        new BN(mlnPrice)
      ).add(new BN(1)).toString(); // adding 1 protects against rounding error (i.e. gives :ceiling")
    });

    it('cannot fill the order', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
        [
          wethQuantity, // min incoming asset (WETH) amount
          mlnQuantity // exact outgoing asset (MLN) amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
