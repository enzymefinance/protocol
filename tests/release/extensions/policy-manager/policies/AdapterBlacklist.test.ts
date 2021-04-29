import { randomAddress } from '@enzymefinance/ethers';
import { AdapterBlacklist, adapterBlacklistArgs, PolicyHook, validateRulePreCoIArgs } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [EOAPolicyManager, ...remainingAccounts],
    deployment,
    config,
  } = await deployProtocolFixture();

  const adapterBlacklist = await AdapterBlacklist.deploy(deployer, EOAPolicyManager);
  const permissionedAdapterBlacklist = adapterBlacklist.connect(EOAPolicyManager);

  const blacklistedAdapters = [randomAddress(), randomAddress()];
  const comptrollerProxy = randomAddress();
  const adapterBlacklistConfig = adapterBlacklistArgs(blacklistedAdapters);
  await permissionedAdapterBlacklist.addFundSettings(comptrollerProxy, adapterBlacklistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    EOAPolicyManager,
    comptrollerProxy,
    deployment,
    config,
    blacklistedAdapters,
    permissionedAdapterBlacklist,
    adapterBlacklist,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, adapterBlacklist },
    } = await provider.snapshot(snapshot);

    const policyManagerResult = await adapterBlacklist.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const implementedHooksResult = await adapterBlacklist.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PreCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { adapterBlacklist, blacklistedAdapters, comptrollerProxy } = await provider.snapshot(snapshot);

    const adapterBlacklistConfig = adapterBlacklistArgs(blacklistedAdapters);

    await expect(adapterBlacklist.addFundSettings(comptrollerProxy, adapterBlacklistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets config values for fund and fires events', async () => {
    const { permissionedAdapterBlacklist, blacklistedAdapters, comptrollerProxy } = await provider.snapshot(snapshot);

    const additionalBlacklistedAdapters = [randomAddress(), randomAddress()];
    const adapterBlacklistConfig = adapterBlacklistArgs(additionalBlacklistedAdapters);
    const receipt = await permissionedAdapterBlacklist.addFundSettings(comptrollerProxy, adapterBlacklistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: additionalBlacklistedAdapters,
    });

    // List should be the blacklisted adapters
    const listResult = await permissionedAdapterBlacklist.getList(comptrollerProxy);
    expect(listResult).toMatchObject(blacklistedAdapters.concat(additionalBlacklistedAdapters));
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { adapterBlacklist } = await provider.snapshot(snapshot);

    await expect(adapterBlacklist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns false if an adapter is in the blacklist', async () => {
    const { adapterBlacklist, blacklistedAdapters, comptrollerProxy } = await provider.snapshot(snapshot);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: blacklistedAdapters[0], // bad adapter
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await adapterBlacklist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBeFalsy();
  });

  it('returns true if an adapter is not in the blacklist', async () => {
    const { adapterBlacklist, comptrollerProxy } = await provider.snapshot(snapshot);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: randomAddress(), // good adapter
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await adapterBlacklist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBeTruthy();
  });
});
