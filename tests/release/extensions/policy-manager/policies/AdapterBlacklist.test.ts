import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { AdapterBlacklist } from '@melonproject/protocol';
import {
  defaultTestDeployment,
  assertEvent,
  adapterBlacklistArgs,
  policyHooks,
  validateRulePreCoIArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithStandalonePolicy(provider: EthereumTestnetProvider) {
  const { accounts, config } = await provider.snapshot(snapshot);

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const adapterBlacklist = await AdapterBlacklist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    adapterBlacklist,
    blacklistedAdapters: [randomAddress(), randomAddress()],
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    adapterBlacklist,
    blacklistedAdapters,
    comptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAdapterBlacklist = adapterBlacklist.connect(
    EOAPolicyManager,
  );
  const adapterBlacklistConfig = await adapterBlacklistArgs(
    blacklistedAdapters,
  );
  await permissionedAdapterBlacklist.addFundSettings(
    comptrollerProxy,
    adapterBlacklistConfig,
  );

  return {
    accounts,
    adapterBlacklist: permissionedAdapterBlacklist,
    comptrollerProxy,
    blacklistedAdapters,
    EOAPolicyManager,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, adapterBlacklist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = adapterBlacklist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const implementedHooksCall = adapterBlacklist.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      policyHooks.PreCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      adapterBlacklist,
      blacklistedAdapters,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const adapterBlacklistConfig = await adapterBlacklistArgs(
      blacklistedAdapters,
    );
    const addFundSettingsTx = adapterBlacklist.addFundSettings(
      comptrollerProxy,
      adapterBlacklistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      adapterBlacklist,
      blacklistedAdapters,
      comptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const adapterBlacklistConfig = await adapterBlacklistArgs(
      blacklistedAdapters,
    );
    const addFundSettingsTx = adapterBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, adapterBlacklistConfig);

    // List should be the blacklisted adapters
    const getListCall = adapterBlacklist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(blacklistedAdapters);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: blacklistedAdapters,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { adapterBlacklist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = adapterBlacklist.updateFundSettings(
      randomAddress(),
      randomAddress(),
      '0x',
    );
    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns false if an adapter is in the blacklist', async () => {
    const {
      adapterBlacklist,
      blacklistedAdapters,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the adapter arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      blacklistedAdapters[0], // bad adapter
      utils.randomBytes(4),
    );
    const validateRuleCall = adapterBlacklist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreCallOnIntegration,
        preCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if an adapter is not in the blacklist', async () => {
    const { adapterBlacklist, comptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the adapter arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      randomAddress(), // good adapter
      utils.randomBytes(4),
    );
    const validateRuleCall = adapterBlacklist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreCallOnIntegration,
        preCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });
});
