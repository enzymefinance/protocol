/*
 * @file Tests funds trading via the mock adapter.
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
  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;

  const registry = contracts.Registry;
  const version = contracts.Version;
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
    version
  });
});

describe('Asset in Registry', () => {
  test('can NOT trade when maker or taker asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Take orders
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Maker asset not registered");

    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            randomHex(20),
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Taker asset not registered");
  });

  test('can NOT TAKE order when TAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            mln.options.address,
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Taker fee asset not registered");
  });

  test('can TAKE order when MAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Take order
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            mln.options.address,
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            weth.options.address
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        defaultTxOpts
      )
    ).resolves.not.toThrowFlexible();
  });
});
