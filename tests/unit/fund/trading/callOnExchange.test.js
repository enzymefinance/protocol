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
import { deploy, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let defaultTxOpts, managerTxOpts;
let deployer, manager, investor;
let exchangeIndex, makeOrderSignature, takeOrderSignature, cancelOrderSignature;
let mockExchangeAddress;
let weth, mln;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  // Define vars - orders
  exchangeIndex = 0;
  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder'
  );
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder'
  );
  cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder'
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
      false,
      [
        encodeFunctionSignature(makeOrderSignature),
        encodeFunctionSignature(takeOrderSignature),
        encodeFunctionSignature(cancelOrderSignature)
      ]
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [mockExchangeAddress],
    exchangeAdapters: [mockAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    investor,
    quoteToken: weth.options.address,
    version
  });
});

describe('Asset in Registry', () => {
  test('can NOT trade when maker or taker asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Make orders
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          makeOrderSignature,
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
        managerTxOpts
      )
    ).rejects.toThrowFlexible("Maker asset not registered");

    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          makeOrderSignature,
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
        managerTxOpts
      )
    ).rejects.toThrowFlexible("Taker asset not registered");

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
        managerTxOpts
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
        managerTxOpts
      )
    ).rejects.toThrowFlexible("Taker asset not registered");
  });

  test('can NOT MAKE order when MAKER fee asset NOT in Registry', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      )
    ).rejects.toThrowFlexible("Maker fee asset not registered");
  });

  test('can MAKE order when TAKER fee asset NOT in Registry', async () => {
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
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            mln.options.address,
            randomHex(20)
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      )
    ).resolves.not.toThrowFlexible();
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
        managerTxOpts
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
        managerTxOpts
      )
    ).resolves.not.toThrowFlexible();
  });

  test('MAKE and CANCEL order increment and decrement asset approval', async () => {
    const { trading } = fund;

    const makerQuantity = 100;
    const takerQuantity = 200;

    // Make order
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          makeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            mln.options.address,
            randomHex(20)
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      )
    ).resolves.not.toThrowFlexible();

    let approvedWeth = await weth.methods.allowance(fund.trading.options.address, mockExchangeAddress).call();
    expect(Number(approvedWeth)).toBe(makerQuantity);

    // Cancel order
    await expect(
      send(
        trading,
        'callOnExchange',
        [
          exchangeIndex,
          cancelOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20)
          ],
          [100, 0, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      )
    ).resolves.not.toThrowFlexible();

    approvedWeth = await weth.methods.allowance(fund.trading.options.address, mockExchangeAddress).call();
    expect(Number(approvedWeth)).toBe(0);
  });
});
