/*
 * @file Tests Trading contract functions and events
 *
 * @test constructor()
 * @test disableAdapters()
 * @test enableAdapters()
 */

import { randomHex } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3
let defaultTxOpts, managerTxOpts;
let deployer, manager, maliciousUser;
let kyberAdapter, oasisDexAdapter, uniswapAdapter;
let engineAdapter, registry;
let weth;
let fundFactory;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, maliciousUser] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER, web3);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
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
  let disableAdapterTxBlock;

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
      disableAdapterTxBlock = await web3.eth.getBlockNumber();

      postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');
    });
  
    it('correctly updates state', async () => {
      // 1. Returns correct disabled adapters length
      expect(postEnabledAdapters.length).toEqual(
        preEnabledAdapters.length - adaptersToDisable.length
      );
      // 2. Returns correct enabledAdapters
      for (let i = 0; i < adaptersToDisable.length; i++) {
        expect(postEnabledAdapters.includes(adaptersToDisable[i])).toBeFalsy();
      };
    });
  
    it('emits correct AdapterDisabled events', async () => {
      const events = await fund.vault.getPastEvents(
        'AdapterDisabled',
        {
          fromBlock: disableAdapterTxBlock,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(2);

      for (let i = 0; i < events.length; i++) {
        expect(events[i].returnValues.adapter).toBe(adaptersToDisable[i]);
      };
    });
  })
});

describe('enableAdapters', () => {
  let fund;
  let initialAdapters, adaptersToEnable
  let enableAdapterTxBlock;

  beforeAll(async () => {
    initialAdapters = [oasisDexAdapter.options.address];
    adaptersToEnable = [uniswapAdapter.options.address, kyberAdapter.options.address];

    fund = await setupFundWithParams({
      integrationAdapters: initialAdapters,
      manager,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });

    // De-register KyberAdapter from registry to re-register it later
    await send(
      registry,
      'deregisterIntegrationAdapter',
      [kyberAdapter.options.address],
      defaultTxOpts,
      web3
    );
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
      // Re-register KyberAdapter
      await send(
        registry,
        'registerIntegrationAdapter',
        [kyberAdapter.options.address],
        defaultTxOpts,
        web3
      );

      preEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');

      await expect(
        send(fund.vault, 'enableAdapters', [adaptersToEnable], managerTxOpts, web3)
      ).resolves.not.toThrow();
      enableAdapterTxBlock = await web3.eth.getBlockNumber();

      postEnabledAdapters = await call(fund.vault, 'getEnabledAdapters');
    });
  
    it('correctly updates state', async () => {
      // 1. Returns correct enabledAdapters length
      expect(postEnabledAdapters.length).toEqual(
        preEnabledAdapters.length + adaptersToEnable.length
      );
      // 2. Returns correct enabledAdapters
      for (let i = 0; i < adaptersToEnable.length; i++) {
        expect(adaptersToEnable[i]).toBe(postEnabledAdapters.slice(-2)[i]);
      };
    });
  
    it('emits correct AdapterEnabled events', async () => {
      const events = await fund.vault.getPastEvents(
        'AdapterEnabled',
        {
          fromBlock: enableAdapterTxBlock,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(2);
  
      for (let i = 0; i < events.length; i++) {
        expect(events[i].returnValues.adapter).toBe(adaptersToEnable[i]);
      };
    });
  })
});
