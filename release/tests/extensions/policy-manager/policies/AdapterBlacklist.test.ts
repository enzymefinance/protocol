import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { AdapterBlacklist } from '../../../../utils/contracts';
import {
  adapterBlacklistArgs,
  policyHooks,
  policyHookExecutionTimes,
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

    const policyHookCall = adapterBlacklist.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.CallOnIntegration);

    const policyHookExecutionTimeCall = adapterBlacklist.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Pre,
    );
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
      utils.randomBytes(4),
      blacklistedAdapters[0], // bad adapter
      [],
      [],
      [],
      [],
    );
    const validateRuleCall = adapterBlacklist.validateRule
      .args(comptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if an adapter is not in the blacklist', async () => {
    const { adapterBlacklist, comptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the adapter arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      utils.randomBytes(4),
      randomAddress(), // good adapter
      [],
      [],
      [],
      [],
    );
    const validateRuleCall = adapterBlacklist.validateRule
      .args(comptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });
});
