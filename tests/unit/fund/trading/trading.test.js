/*
 * @file Tests Trading contract functions and events
 *
 * @test addExchange()
 * @test multiCallOnExchange()
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, deploy, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';

let defaultTxOpts, managerTxOpts, randomUserTxOpts;
let deployer, manager, randomUser;
let contracts;
let weth, mln, registry;
let fund;
let takeOrderFunctionSig;

beforeAll(async () => {
  [deployer, manager, randomUser] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  randomUserTxOpts = { ...defaultTxOpts, from: randomUser }

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );
});

describe('addExchange', () => {
  let newAdapter, newExchange;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    contracts = deployed.contracts;

    weth = contracts.WETH;
    mln = contracts.MLN;
    registry = contracts.Registry;

    const version = contracts.Version;
    const oasisDexExchange = contracts.OasisDexExchange;
    const oasisDexAdapter = contracts.OasisDexAdapter;

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      exchanges: [oasisDexExchange.options.address],
      exchangeAdapters: [oasisDexAdapter.options.address],
      manager,
      quoteToken: weth.options.address,
      version
    });

    newExchange = randomHex(20);
    newAdapter = randomHex(20);
  });

  test('does not allow unauthorized user', async () => {
    const { trading } = fund;

    await expect(
      send(
        trading,
        'addExchange',
        [newExchange, newAdapter],
        { ...defaultTxOpts, from: randomUser }
      )
    ).rejects.toThrowFlexible("ds-auth-unauthorized");
  });

  test('does not allow un-registered adapter', async () => {
    const { trading } = fund;

    await expect(
      send(trading, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).rejects.toThrowFlexible("Adapter is not registered");
  });

  test('allows an authenticated user to add a registered exchange adapter', async () => {
    const { trading } = fund;

    const preAddExchangeCount = (await call(trading, 'getExchangeInfo'))[0].length;

    await send(
      registry,
      'registerExchangeAdapter',
      [newExchange, newAdapter, false, []],
      defaultTxOpts
    )
    await expect(
      send(trading, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).resolves.not.toThrowFlexible();

    const postExchangeInfo = await call(trading, 'getExchangeInfo');
    const newExchangeIndex = postExchangeInfo[0].findIndex(
      e => e.toLowerCase() === newExchange.toLowerCase()
    );

    expect(newExchangeIndex).toEqual(preAddExchangeCount);
    expect(
      postExchangeInfo[1][newExchangeIndex].toLowerCase()
    ).toEqual(newAdapter.toLowerCase());
  });

  test('does not allow a previously-added exchange', async () => {
    const { trading } = fund;

    await expect(
      send(trading, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).rejects.toThrowFlexible("Adapter already added");
  });
});

describe('multiCallOnExchange', () => {
  let orderParams;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    contracts = deployed.contracts;

    weth = contracts.WETH;
    mln = contracts.MLN;

    const registry = contracts.Registry;
    const version = contracts.Version;

    const mockAdapter = await deploy(CONTRACT_NAMES.MOCK_ADAPTER);
    const mockExchangeAddress = randomHex(20);
    await send(
      registry,
      'registerExchangeAdapter',
      [
        mockExchangeAddress,
        mockAdapter.options.address,
        false,
        [encodeFunctionSignature(takeOrderFunctionSig)]
      ],
      defaultTxOpts
    );

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      exchanges: [mockExchangeAddress],
      exchangeAdapters: [mockAdapter.options.address],
      manager,
      quoteToken: weth.options.address,
      version
    });

    orderParams = [
      0,
      takeOrderFunctionSig,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        weth.options.address,
        mln.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0'
    ];
  });

  it("can be called by any user", async() => {
    const { trading } = fund;
    const orders = [orderParams];
    const multiOrderParams = [[], [], [], [], [], [], []];
    for (const order of orders) {
      for (const key in order) {
        multiOrderParams[key].push(order[key]);
      }
    };

    await expect(
      send(trading, 'multiCallOnExchange', multiOrderParams, randomUserTxOpts)
    ).resolves.not.toThrow();
  });

  it("cannot be called with empty param arrays", async() => {
    const { trading } = fund;
    const multiOrderParams = [[], [], [], [], [], [], []];

    await expect(
      send(trading, 'multiCallOnExchange', multiOrderParams, managerTxOpts)
    ).rejects.toThrowFlexible("multiCallOnExchange: no params detected");
  });

  it("cannot be called with unequal length param arrays", async() => {
    const { trading } = fund;
    const orders = [orderParams];
    const multiOrderParams = [[], [], [], [], [], [], []];
    for (const order of orders) {
      for (const key in order) {
        multiOrderParams[key].push(order[key]);
      }
    };
    multiOrderParams[1].push(takeOrderFunctionSig);

    await expect(
      send(trading, 'multiCallOnExchange', multiOrderParams, managerTxOpts)
    ).rejects.toThrowFlexible("multiCallOnExchange: params must be equal length arrays");
  });

  it("emits correct number of events", async() => {
    const { trading } = fund;
    const orders = [orderParams, orderParams, orderParams, orderParams];
    const multiOrderParams = [[], [], [], [], [], [], []];
    for (const order of orders) {
      for (const key in order) {
        multiOrderParams[key].push(order[key]);
      }
    };

    const preTxBlock = await web3.eth.getBlockNumber();

    await expect(
      send(trading, 'multiCallOnExchange', multiOrderParams, managerTxOpts)
    ).resolves.not.toThrow();

    const events = await trading.getPastEvents(
      'ExchangeMethodCall',
      {
        fromBlock: preTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(orders.length);
  });
});
