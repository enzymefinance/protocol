import { utils } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { AdapterWhitelist, adapterWhitelistArgs, PolicyHook, validateRulePreCoIArgs } from '@melonproject/protocol';
import { assertEvent, defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts: [EOAPolicyManager, ...remainingAccounts],
    config,
  } = await provider.snapshot(snapshot);

  const adapterWhitelist = await AdapterWhitelist.deploy(config.deployer, EOAPolicyManager);

  return {
    accounts: remainingAccounts,
    adapterWhitelist,
    whitelistedAdapters: [randomAddress(), randomAddress()],
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
  };
}

async function snapshotWithConfiguredStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts,
    adapterWhitelist,
    whitelistedAdapters,
    comptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAdapterWhitelist = adapterWhitelist.connect(EOAPolicyManager);

  const adapterWhitelistConfig = adapterWhitelistArgs(whitelistedAdapters);
  await permissionedAdapterWhitelist.addFundSettings(comptrollerProxy, adapterWhitelistConfig);

  return {
    accounts,
    adapterWhitelist: permissionedAdapterWhitelist,
    comptrollerProxy,
    whitelistedAdapters,
    EOAPolicyManager,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, adapterWhitelist },
    } = await provider.snapshot(snapshot);

    const policyManagerResult = await adapterWhitelist.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const implementedHooksResult = await adapterWhitelist.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PreCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const adapterWhitelistConfig = adapterWhitelistArgs(whitelistedAdapters);

    await expect(adapterWhitelist.addFundSettings(comptrollerProxy, adapterWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy, EOAPolicyManager } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const adapterWhitelistConfig = adapterWhitelistArgs(whitelistedAdapters);
    const receipt = await adapterWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, adapterWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedAdapters,
    });

    // List should be the whitelisted adapters
    const listResult = await adapterWhitelist.getList(comptrollerProxy);
    expect(listResult).toMatchObject(whitelistedAdapters);
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { adapterWhitelist } = await provider.snapshot(snapshotWithStandalonePolicy);

    await expect(adapterWhitelist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns true if an adapter is in the whitelist', async () => {
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: whitelistedAdapters[0], // good adapter
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await adapterWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBeTruthy();
  });

  it('returns false if an adapter is not in the whitelist', async () => {
    const { adapterWhitelist, comptrollerProxy } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: randomAddress(), // bad adapter
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await adapterWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBeFalsy();
  });
});
