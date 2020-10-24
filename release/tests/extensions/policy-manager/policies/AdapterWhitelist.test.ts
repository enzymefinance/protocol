import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { AdapterWhitelist } from '../../../../utils/contracts';
import {
  adapterWhitelistArgs,
  policyHooks,
  validateRulePreCoIArgs,
} from '../../../utils';

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
  const adapterWhitelist = await AdapterWhitelist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    adapterWhitelist,
    whitelistedAdapters: [randomAddress(), randomAddress()],
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    adapterWhitelist,
    whitelistedAdapters,
    comptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAdapterWhitelist = adapterWhitelist.connect(
    EOAPolicyManager,
  );
  const adapterWhitelistConfig = await adapterWhitelistArgs(
    whitelistedAdapters,
  );
  await permissionedAdapterWhitelist.addFundSettings(
    comptrollerProxy,
    adapterWhitelistConfig,
  );

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

    const getPolicyManagerCall = adapterWhitelist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const implementedHooksCall = adapterWhitelist.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      policyHooks.PreCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      adapterWhitelist,
      whitelistedAdapters,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const adapterWhitelistConfig = await adapterWhitelistArgs(
      whitelistedAdapters,
    );
    const addFundSettingsTx = adapterWhitelist.addFundSettings(
      comptrollerProxy,
      adapterWhitelistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      adapterWhitelist,
      whitelistedAdapters,
      comptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const adapterWhitelistConfig = await adapterWhitelistArgs(
      whitelistedAdapters,
    );
    const addFundSettingsTx = adapterWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, adapterWhitelistConfig);

    // List should be the whitelisted adapters
    const getListCall = adapterWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(whitelistedAdapters);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedAdapters,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { adapterWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = adapterWhitelist.updateFundSettings(
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
  it('returns true if an adapter is in the whitelist', async () => {
    const {
      adapterWhitelist,
      whitelistedAdapters,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the adapter arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      whitelistedAdapters[0], // good adapter
      utils.randomBytes(4),
    );
    const validateRuleCall = adapterWhitelist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreCallOnIntegration,
        preCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if an adapter is not in the whitelist', async () => {
    const { adapterWhitelist, comptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the adapter arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      randomAddress(), // bad adapter
      utils.randomBytes(4),
    );
    const validateRuleCall = adapterWhitelist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreCallOnIntegration,
        preCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
