/*
 * @file Tests Trading contract functions and events
 *
 * @test addExchange()
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';

let defaultTxOpts, managerTxOpts;
let deployer, manager, investor, maliciousUser;
let contracts, deployOut;
let weth, mln, registry;
let fund;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, maliciousUser] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
});

describe('addExchange', () => {
  let newAdapter, newExchange;
  let addExchangeRequest;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    contracts = deployed.contracts;
    deployOut = deployed.deployOut;

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
    addExchangeRequest = fund.trading.methods.addExchange(newExchange, newAdapter);
  });

  it('does not allow unauthorized user', async () => {
    await expect(
      addExchangeRequest.send({ ...defaultTxOpts, from: maliciousUser })
    ).rejects.toThrow("ds-auth-unauthorized");
  });

  it('does not allow un-registered adapter', async () => {
    await expect(addExchangeRequest.send(managerTxOpts)).rejects.toThrow("Adapter is not registered");
  });

  it('allows an authenticated user to add a registered exchange adapter', async () => {
    await registry.methods
      .registerExchangeAdapter(newExchange, newAdapter, false, [])
      .send(defaultTxOpts);

    await addExchangeRequest.send(managerTxOpts);
  });

  it('does not allow a previously-added exchange', async () => {
    await expect(addExchangeRequest.send(managerTxOpts)).rejects.toThrow("Adapter already added");
  });
})
