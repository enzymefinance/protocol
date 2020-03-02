/*
 * @file Tests Trading contract functions and events
 *
 * @test addExchange()
 */

import { randomHex } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { setupFundWithParams } from '~/tests/utils/fund';

let defaultTxOpts, managerTxOpts;
let deployer, manager, maliciousUser;
let contracts;
let weth, mln, registry;
let fund;

beforeAll(async () => {
  [deployer, manager, maliciousUser] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
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
    const { vault } = fund;

    await expect(
      send(
        vault,
        'addExchange',
        [newExchange, newAdapter],
        { ...defaultTxOpts, from: maliciousUser }
      )
    ).rejects.toThrowFlexible("ds-auth-unauthorized");
  });

  test('does not allow un-registered adapter', async () => {
    const { vault } = fund;

    await expect(
      send(vault, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).rejects.toThrowFlexible("Adapter is not registered");
  });

  test('allows an authenticated user to add a registered exchange adapter', async () => {
    const { vault } = fund;

    const preAddExchangeCount = (await call(vault, 'getExchangeInfo'))[0].length;

    await send(
      registry,
      'registerExchangeAdapter',
      [newExchange, newAdapter, []],
      defaultTxOpts
    )
    await expect(
      send(vault, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).resolves.not.toThrowFlexible();

    const postExchangeInfo = await call(vault, 'getExchangeInfo');
    const newExchangeIndex = postExchangeInfo[0].findIndex(
      e => e.toLowerCase() === newExchange.toLowerCase()
    );

    expect(newExchangeIndex).toEqual(preAddExchangeCount);
    expect(
      postExchangeInfo[1][newExchangeIndex].toLowerCase()
    ).toEqual(newAdapter.toLowerCase());
  });

  test('does not allow a previously-added exchange', async () => {
    const { vault } = fund;

    await expect(
      send(vault, 'addExchange', [newExchange, newAdapter], managerTxOpts)
    ).rejects.toThrowFlexible("Adapter already added");
  });
});
