/*
 * @file Tests Trading contract functions and events
 *
 * @test constructor()
 * @test disableAdapters()
 * @test enableAdapters()
 */

import { randomHex } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3
let defaultTxOpts, managerTxOpts;
let deployer, manager, maliciousUser;
let oasisDexAdapter, uniswapAdapter;
let engineAdapter, registry;
let weth, mln;
let fundFactory;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, maliciousUser] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER, web3);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
});

describe('constructor', () => {
  let fund;
  let integrationAdapters;
  let enabledAdapters;

  beforeAll(async () => {
    integrationAdapters = [
      oasisDexAdapter.options.address,
      uniswapAdapter.options.address
    ];

    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      integrationAdapters,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
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
    adaptersToDisable = [
      uniswapAdapter.options.address,
      engineAdapter.options.address
    ];

    initialAdapters = [
      oasisDexAdapter.options.address,
      ...adaptersToDisable
    ];

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      integrationAdapters: initialAdapters,
      manager,
      quoteToken: weth.options.address,
      manager,
      fundFactory,
      web3
    });
  });

  describe('Bad actions', () => {
    it('does NOT allow unauthorized user', async () => {
      await expect(
        send(
          fund.vault,
          'disableAdapters',
          [adaptersToDisable],
          { ...defaultTxOpts, from: maliciousUser },
          web3
        )
      ).rejects.toThrowFlexible("Only the fund manager can call this function");
    });
  
    it('does NOT allow a disabled (non-existant) integration', async () => {
      const preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'disableAdapters', [[randomHex(20)]], managerTxOpts, web3)
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
        send(fund.vault, 'disableAdapters', [adaptersToDisable], managerTxOpts, web3)
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
    initialAdapters = [oasisDexAdapter.options.address];

    newExchange = randomHex(20);
    newAdapter = randomHex(20);

    adaptersToEnable = [uniswapAdapter.options.address, newAdapter];

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      integrationAdapters: initialAdapters,
      manager,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });
  });

  describe('Bad actions', () => {
    it('does NOT allow unauthorized user', async () => {
      await expect(
        send(
          fund.vault,
          'enableAdapters',
          [adaptersToEnable],
          { ...defaultTxOpts, from: maliciousUser },
          web3
        )
      ).rejects.toThrowFlexible("Only the fund manager can call this function");
    });
  
    it('does NOT allow a previously-added adapter', async () => {
      const preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(
          fund.vault,
          'enableAdapters',
          [initialAdapters],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible("Adapter is already enabled");

      const postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(postEnabledAdapters).toEqual(preEnabledAdapters);
    });
  
    it('does NOT allow un-registered adapter', async () => {
      await expect(
        send(fund.vault, 'enableAdapters', [adaptersToEnable], managerTxOpts, web3)
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
        defaultTxOpts,
        web3
      );

      preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'enableAdapters', [adaptersToEnable], managerTxOpts, web3)
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
