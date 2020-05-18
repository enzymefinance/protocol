/*
 * @file Tests Trading contract functions and events
 *
 * @test constructor()
 * @test disableAdapters()
 * @test enableAdapters()
 */

import { randomHex } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { setupFundWithParams } from '~/tests/utils/fund';

let defaultTxOpts, managerTxOpts;
let deployer, manager, maliciousUser;
let oasisDexAdapter, oasisDexExchange, uniswapAdapter, uniswapFactory;
let engine, engineAdapter, registry;
let weth, mln;

beforeAll(async () => {
  [deployer, manager, maliciousUser] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  weth = contracts.WETH;
  mln = contracts.MLN;

  engine = contracts.Engine;
  engineAdapter = contracts.EngineAdapter;
  oasisDexExchange = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  registry = contracts.Registry;
  uniswapAdapter = contracts.UniswapAdapter;
  uniswapFactory = contracts.UniswapFactory;
});

describe('constructor', async () => {
  let fund;
  let integrationAdapters;
  let enabledAdapters;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts.FundFactory;

    integrationAdapters = [oasisDexAdapter.options.address, uniswapAdapter.options.address];

    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      integrationAdapters,
      quoteToken: weth.options.address,
      fundFactory
    });

    enabledAdapters = await call(fund.vault, 'getEnabledAdapters');
  });

  it('does NOT enable unspecified integration adapter', async () => {
    await expect(enabledAdapters).not.toContain(engineAdapter.options.address);
  });

  it('enables specified integration adapters', async () => {
    for (let i = 0; i < integrationAdapters.length; i++) {
      await expect(enabledAdapters).toContain(integrationAdapters[i]);
    }
  });
});

describe('disableAdapters', () => {
  let fund;
  let initialAdapters, adaptersToDisable
  let disableAdaptersTxBlock;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts.FundFactory;

    adaptersToDisable = [uniswapAdapter.options.address, engineAdapter.options.address];

    initialAdapters = [
      oasisDexAdapter.options.address,
      ...adaptersToDisable
    ];

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      integrationAdapters: initialAdapters,
      manager,
      quoteToken: weth.options.address,
      fundFactory
    });
  });

  describe('Bad actions', () => {
    it('does NOT allow unauthorized user', async () => {
      await expect(
        send(
          fund.vault,
          'disableAdapters',
          [adaptersToDisable],
          { ...defaultTxOpts, from: maliciousUser }
        )
      ).rejects.toThrowFlexible("Only the fund manager can call this function");
    });
  
    it('does NOT allow a disabled (non-existant) integration', async () => {
      const preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'disableAdapters', [[randomHex(20)]], managerTxOpts)
      ).rejects.toThrowFlexible("adapter already disabled");

      const postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(postEnabledAdapters).toEqual(preEnabledAdapters);
    });
  });

  describe('Good action', () => {
    let preEnabledAdapters, postEnabledAdapters;

    it('allows an authenticated user to disable adapters', async () => {  
      preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');
      await expect(
        send(fund.vault, 'disableAdapters', [adaptersToDisable], managerTxOpts)
      ).resolves.not.toThrow();
      disableAdaptersTxBlock = await web3.eth.getBlockNumber();

      postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');
    });
  
    it('correctly updates state', async () => {
      // 1. Returns correct disabledAdapters length
      expect(postEnabledAdapters.length).toEqual(
        preEnabledAdapters.length - adaptersToDisable.length
      );
      // 2. Returns correct enabledAdapters
      for (let i = 0; i < adaptersToDisable.length; i++) {
        expect(postEnabledAdapters.includes(adaptersToDisable[i])).toBeFalsy();
      };
    });
  
    it('emits correct AdaptersDisabled event', async () => {
      const events = await fund.vault.getPastEvents(
        'AdaptersDisabled',
        {
          fromBlock: disableAdaptersTxBlock,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);
  
      const eventValues = events[0].returnValues;
      expect(eventValues.adapters[0]).toBe(adaptersToDisable[0]);
      expect(eventValues.adapters[1]).toBe(adaptersToDisable[1]);
    });
  })
});

describe('enableAdapters', () => {
  let fund;
  let newAdapter, newExchange;
  let initialAdapters, adaptersToEnable
  let enableAdaptersTxBlock;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts.FundFactory;

    initialAdapters = [oasisDexAdapter.options.address];

    newExchange = randomHex(20);
    newAdapter = randomHex(20);

    adaptersToEnable = [uniswapAdapter.options.address, newAdapter];

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      integrationAdapters: initialAdapters,
      manager,
      quoteToken: weth.options.address,
      fundFactory
    });
  });

  describe('Bad actions', () => {
    it('does NOT allow unauthorized user', async () => {
      await expect(
        send(
          fund.vault,
          'enableAdapters',
          [adaptersToEnable],
          { ...defaultTxOpts, from: maliciousUser }
        )
      ).rejects.toThrowFlexible("Only the fund manager can call this function");
    });
  
    it('does NOT allow a previously-added adapter', async () => {
      const preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'enableAdapters', [initialAdapters], managerTxOpts)
      ).rejects.toThrowFlexible("Adapter is already enabled");

      const postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(postEnabledAdapters).toEqual(preEnabledAdapters);
    });
  
    it('does NOT allow un-registered adapter', async () => {
      await expect(
        send(fund.vault, 'enableAdapters', [adaptersToEnable], managerTxOpts)
      ).rejects.toThrowFlexible("Adapter is not on Registry");
    });
  });

  describe('Good action', () => {
    let preEnabledAdapters, postEnabledAdapters;

    it('allows an authenticated user to add registered adapters', async () => {  
      await send(
        registry,
        'registerIntegrationAdapter',
        [newAdapter, newExchange, 1],
        defaultTxOpts
      );

      preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'enableAdapters', [adaptersToEnable], managerTxOpts)
      ).resolves.not.toThrow();
      enableAdaptersTxBlock = await web3.eth.getBlockNumber();

      postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');
    });
  
    it('correctly updates state', async () => {
      // 1. Returns correct enabledAdapters length
      expect(postEnabledAdapters.length).toEqual(
        preEnabledAdapters.length + adaptersToEnable.length
      );
      // 2. Returns correct enabledAdapters
      for (let i = 0; i < adaptersToEnable.length; i++) {
        // Annoying syntax, but need lowercase to match randomHex() output
        expect(adaptersToEnable[i].toLowerCase()).toBe(
          postEnabledAdapters.slice(-2)[i].toLowerCase()
        );
      };
    });
  
    it('emits correct AdaptersEnabled event', async () => {
      const events = await fund.vault.getPastEvents(
        'AdaptersEnabled',
        {
          fromBlock: enableAdaptersTxBlock,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);
  
      const eventValues = events[0].returnValues;
      expect(eventValues.adapters[0]).toBe(adaptersToEnable[0]);
      expect(eventValues.adapters[1].toLowerCase()).toBe(adaptersToEnable[1]);
    });
  })
});
