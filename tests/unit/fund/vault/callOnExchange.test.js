/*
 * @file Tests funds vault via the mock adapter.
 * @dev This allows checking policies and other proprietary requirements without needing to satisfy exchange requirements
 *
 * @test Fund can NOT trade when maker or taker asset NOT in Registry
 * @test Fund can NOT TAKE order when TAKER fee asset NOT in Registry
 * @test Fund can TAKE order when MAKER fee asset NOT in Registry
 * @test Fund can NOT MAKE order when MAKER fee asset NOT in Registry
 * @test Fund can MAKE order when TAKER fee asset NOT in Registry
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy, send, call } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let defaultTxOpts;
let deployer;
let exchangeIndex, takeOrderSignature;
let mockExchangeAddress;
let weth, mln;
let fund;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  // Define vars - orders
  exchangeIndex = 0;
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
});

beforeEach(async () => {
  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  const registry = contracts.Registry;
  const fundFactory = contracts.FundFactory;
  weth = contracts.WETH;
  mln = contracts.MLN;

  // Register a mock exchange and adapter
  mockExchangeAddress = randomHex(20);
  const mockAdapter = await deploy(CONTRACT_NAMES.MOCK_ADAPTER);
  await send(
    registry,
    'registerExchangeAdapter',
    [
      mockExchangeAddress,
      mockAdapter.options.address,
      [encodeFunctionSignature(takeOrderSignature)]
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [mockExchangeAddress],
    exchangeAdapters: [mockAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor: deployer,
      tokenContract: weth
    },
    quoteToken: weth.options.address,
    fundFactory
  });
});

describe('Asset in Registry', () => {
  test('can NOT trade when maker or taker asset NOT in Registry', async () => {
    const { vault } = fund;

    const makerAddress = EMPTY_ADDRESS;
    const takerAddress = EMPTY_ADDRESS;
    const badMakerAsset = randomHex(20);
    const takerAsset = weth.options.address;
    const makerFeeAsset = EMPTY_ADDRESS;
    const takerFeeAsset = EMPTY_ADDRESS;
    const makerQuantity = 100;
    const takerQuantity = 200;
    const fillAmount = takerQuantity;

    const orderAddresses = [];
    const orderValues = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = takerAddress;
    orderAddresses[2] = badMakerAsset;
    orderAddresses[3] = takerAsset;
    orderAddresses[4] = makerFeeAsset;
    orderAddresses[5] = takerFeeAsset;
    orderValues[0] = makerQuantity;
    orderValues[1] = takerQuantity;
    orderValues[2] = fillAmount;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs = web3.utils.hexToBytes(hex);

    // Take orders
    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("Maker asset not registered");

    const makerAsset = weth.options.address;
    const badTakerAsset = randomHex(20);
    orderAddresses[2] = makerAsset;
    orderAddresses[3] = badTakerAsset;

    const hex1 = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs1 = web3.utils.hexToBytes(hex1);

    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs1,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("Taker asset not registered");
  });

  test('can NOT TAKE order when TAKER fee asset NOT in Registry', async () => {
    const { vault } = fund;

    const makerAddress = EMPTY_ADDRESS;
    const takerAddress = EMPTY_ADDRESS;
    const badMakerAsset = randomHex(20);
    const takerAsset = weth.options.address;
    const makerFeeAsset = EMPTY_ADDRESS;
    const takerFeeAsset = EMPTY_ADDRESS;
    const makerQuantity = 100;
    const takerQuantity = 200;
    const fillAmount = takerQuantity;

    const orderAddresses = [];
    const orderValues = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = takerAddress;
    orderAddresses[2] = badMakerAsset;
    orderAddresses[3] = takerAsset;
    orderAddresses[4] = makerFeeAsset;
    orderAddresses[5] = takerFeeAsset;
    orderValues[0] = makerQuantity;
    orderValues[1] = takerQuantity;
    orderValues[2] = fillAmount;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs = web3.utils.hexToBytes(hex);

    // Take orders
    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("Maker asset not registered");

    const badFeeRecipientAddress = randomHex(20);
    orderAddresses[2] = weth.options.address;
    orderAddresses[5] = badFeeRecipientAddress;

    const hex1 = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs1 = web3.utils.hexToBytes(hex1);

    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs1,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("Taker fee asset not registered");
  });

  test('can TAKE order when MAKER fee asset NOT in Registry', async () => {
    const { vault } = fund;

    const makerAddress = EMPTY_ADDRESS;
    const takerAddress = EMPTY_ADDRESS;
    const badMakerAsset = randomHex(20);
    const takerAsset = weth.options.address;
    const makerFeeAsset = EMPTY_ADDRESS;
    const takerFeeAsset = EMPTY_ADDRESS;
    const makerQuantity = 100;
    const takerQuantity = 200;
    const fillAmount = takerQuantity;

    const orderAddresses = [];
    const orderValues = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = takerAddress;
    orderAddresses[2] = badMakerAsset;
    orderAddresses[3] = takerAsset;
    orderAddresses[4] = makerFeeAsset;
    orderAddresses[5] = takerFeeAsset;
    orderValues[0] = makerQuantity;
    orderValues[1] = takerQuantity;
    orderValues[2] = fillAmount;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs = web3.utils.hexToBytes(hex);

    // Take orders
    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("Maker asset not registered");

    orderAddresses[2] = mln.options.address;
    orderAddresses[3] = weth.options.address;
    orderAddresses[4] = randomHex(20);
    orderAddresses[5] = weth.options.address;

    const hex1 = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs1 = web3.utils.hexToBytes(hex1);

    // Take order
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs1,
        ],
        defaultTxOpts,
      )
    ).resolves.not.toThrowFlexible();
  });
});
