/*
 * @file Unit tests for trading via the EngineAdapter (input validation only)
 *
 * @dev This file only contains tests for callOnExchange param validation.
 * Other tests rely on EVM manipulation not allowed on testnets (only local blockchain).
 * Those tests are in engineAdapterLocal.test.js
 *
 * @test takeOrder: __validateTakeOrderParams
 */

import { BN, toWei } from 'web3-utils';

import { call, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts;
let contracts;
let dai, mln, weth;
let engine;
let engineAdapter;
let fund;
let takeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
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
    let makerAsset, makerQuantity, takerAsset, takerQuantity, fillQuantity;
    let badAsset;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      makerQuantity = toWei('0.02', 'ether');
      takerAsset = mln.options.address;
      takerQuantity = toWei('0.01', 'ether');
      badAsset = dai.options.address;

      // Set up fund
      const version = contracts[CONTRACT_NAMES.VERSION];
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        exchanges: [engine.options.address],
        exchangeAdapters: [engineAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: mln
        },
        quoteToken: weth.options.address,
        version
      });
      exchangeIndex = 0;
    });

    it('does not allow maker asset other than WETH', async () => {
      const { trading } = fund;
      const orderAddresses = [];
      const orderValues = [];

      orderAddresses[0] = badAsset;
      orderAddresses[1] = takerAsset;
      orderValues[0] = makerQuantity;
      orderValues[1] = takerQuantity;

      const hex = web3.eth.abi.encodeParameters(
        ['address[2]', 'uint256[2]'],
        [orderAddresses, orderValues],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            '0x0',
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("maker asset does not match nativeAsset")
    });

    it('does not allow taker asset other than MLN', async () => {
      const { trading } = fund;
      const orderAddresses = [];
      const orderValues = [];

      orderAddresses[0] = makerAsset;
      orderAddresses[1] = badAsset;
      orderValues[0] = makerQuantity;
      orderValues[1] = takerQuantity;

      const hex = web3.eth.abi.encodeParameters(
        ['address[2]', 'uint256[2]'],
        [orderAddresses, orderValues],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            '0x0',
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("taker asset does not match mlnToken")
    });

    it('does not allow trade when no ether in engine', async () => {
      const { trading } = fund;
      const zeroMakerQuanity = 0;
      const orderAddresses = [];
      const orderValues = [];

      orderAddresses[0] = makerAsset;
      orderAddresses[1] = takerAsset;
      orderValues[0] = zeroMakerQuanity;
      orderValues[1] = takerQuantity;

      const hex = web3.eth.abi.encodeParameters(
        ['address[2]', 'uint256[2]'],
        [orderAddresses, orderValues],
      );
      const encodedArgs = web3.utils.hexToBytes(hex);

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            exchangeIndex,
            takeOrderSignature,
            '0x0',
            encodedArgs,
          ],
          defaultTxOpts,
        )
      ).rejects.toThrowFlexible("Not enough liquid ether to send")
    });
  });
});
