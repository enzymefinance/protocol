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
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3
let deployer, manager;
let dai, mln, weth, engineAdapter, fundFactory;
let managerTxOpts;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.DAI, web3, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
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
      fund = await setupFundWithParams({
        integrationAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        manager,
        quoteToken: mln.options.address,
        fundFactory,
        web3
      });
    });

    it('does not allow maker asset other than WETH', async () => {
      const { vault } = fund;

      const encodedArgs = encodeTakeOrderArgs({
        makerAsset: badAsset,
        makerQuantity,
        takerAsset,
        takerQuantity,
      }, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
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
      }, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
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
      }, web3);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            engineAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
