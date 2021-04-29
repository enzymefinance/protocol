import { randomAddress } from '@enzymefinance/ethers';
import { AdapterWhitelist, adapterWhitelistArgs, PolicyHook, validateRulePreCoIArgs } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [EOAPolicyManager, ...remainingAccounts],
    deployment,
    config,
  } = await deployProtocolFixture();

  const comptrollerProxy = randomAddress();
  const whitelistedAdapters = [randomAddress(), randomAddress()];
  const adapterWhitelist = await AdapterWhitelist.deploy(deployer, EOAPolicyManager);
  const permissionedAdapterWhitelist = adapterWhitelist.connect(EOAPolicyManager);
  const adapterWhitelistConfig = adapterWhitelistArgs(whitelistedAdapters);
  await permissionedAdapterWhitelist.addFundSettings(comptrollerProxy, adapterWhitelistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    deployment,
    comptrollerProxy,
    adapterWhitelist,
    whitelistedAdapters,
    permissionedAdapterWhitelist,
    config,
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
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy } = await provider.snapshot(snapshot);

    const adapterWhitelistConfig = adapterWhitelistArgs(whitelistedAdapters);

    await expect(adapterWhitelist.addFundSettings(comptrollerProxy, adapterWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy, EOAPolicyManager } = await provider.snapshot(
      snapshot,
    );

    const extraWhitelistedAdapters = [randomAddress(), randomAddress()];
    const adapterWhitelistConfig = adapterWhitelistArgs(extraWhitelistedAdapters);
    const receipt = await adapterWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, adapterWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: extraWhitelistedAdapters,
    });

    // List should be the whitelisted adapters
    const listResult = await adapterWhitelist.getList(comptrollerProxy);
    expect(listResult).toMatchObject(whitelistedAdapters.concat(extraWhitelistedAdapters));
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { adapterWhitelist } = await provider.snapshot(snapshot);

    await expect(adapterWhitelist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns true if an adapter is in the whitelist', async () => {
    const { adapterWhitelist, whitelistedAdapters, comptrollerProxy } = await provider.snapshot(snapshot);

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
    const { adapterWhitelist, comptrollerProxy } = await provider.snapshot(snapshot);

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
