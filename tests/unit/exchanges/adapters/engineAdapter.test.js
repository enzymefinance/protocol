/*
 * @file Unit tests for vault via the EngineAdapter (input validation only)
 *
 * @dev This file only contains tests for callOnIntegration param validation.
 * Other tests rely on EVM manipulation not allowed on testnets (only local blockchain).
 * Those tests are in engineAdapterLocal.test.js
 * All funds are denominated in MLN so that funds can receive MLN as investment
 * 
 * @test takeOrder: __validateTakeOrderParams
 */

import { toWei } from 'web3-utils';

import { send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, weth;
let engine;
let engineAdapter;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;

  engine = contracts[CONTRACT_NAMES.ENGINE];
  engineAdapter = contracts[CONTRACT_NAMES.ENGINE_ADAPTER];
});

describe('takeOrder', () => {
  describe('__validateTakeOrderParams', () => {
    let makerAsset, makerQuantity, takerAsset, takerQuantity;
    let badAsset;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      badAsset = dai.options.address;

      // Set up fund
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
      fund = await setupFundWithParams({
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: mln.options.address,
        fundFactory
      });
    });

    it('does not allow maker asset other than WETH', async () => {
      const { vault } = fund;

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset: badAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("maker asset does not match nativeAsset")
    });

    it('does not allow taker asset other than MLN', async () => {
      const { vault } = fund;

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity,
        takerAsset: badAsset,
        takerQuantity,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("taker asset does not match mlnToken")
    });

    it('does not allow trade when no ether in engine', async () => {
      const { vault } = fund;
      const zeroMakerQuanity = 0;

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset,
        makerQuantity: zeroMakerQuanity,
        takerAsset: takerAsset,
        takerQuantity,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
