import { randomAddress } from '@enzymefinance/ethers';
import {
  AdapterBlacklist,
  adapterBlacklistArgs,
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  kyberTakeOrderArgs,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
  takeOrderSelector,
  validateRulePreCoIArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createFundDeployer,
  createMigratedFundConfig,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
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

describe('integration tests', () => {
  it('can create a new fund with this policy, and it works correctly during callOnIntegration', async () => {
    const {
      accounts: [fundOwner],
      config,
      deployment: { kyberAdapter, integrationManager, fundDeployer, adapterBlacklist },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(config.weth, whales.weth);
    const incomingAsset = new StandardToken(config.primitives.mln, whales.mln);

    // declare variables for policy config
    const adapterBlacklistAddresses = [kyberAdapter];
    const adapterBlacklistSettings = adapterBlacklistArgs(adapterBlacklistAddresses);
    const adapterBlacklistConfigData = policyManagerConfigArgs({
      policies: [adapterBlacklist.address],
      settings: [adapterBlacklistSettings],
    });

    // create new fund with policyManagerConfig argument
    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig: adapterBlacklistConfigData,
    });

    // Try to trade on kyber and expect a failure
    const kyberArgs = kyberTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAsset: denominationAsset,
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const kyberCallArgs = callOnIntegrationArgs({
      adapter: kyberAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: kyberArgs,
    });

    const kyberTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, kyberCallArgs);

    await expect(kyberTx).rejects.toBeRevertedWith('Rule evaluated to false: ADAPTER_BLACKLIST');
  });

  it('can create a migrated fund with this policy', async () => {
    const {
      accounts: [fundOwner],
      deployer,
      config: {
        weth,
        primitives,
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        kyberAdapter,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
        adapterBlacklist,
      },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);
    const incomingAsset = new StandardToken(primitives.mln, whales.mln);

    const adapterBlacklistAddresses = [kyberAdapter];
    const adapterBlacklistSettings = adapterBlacklistArgs(adapterBlacklistAddresses);
    const adapterBlacklistConfigData = policyManagerConfigArgs({
      policies: [adapterBlacklist.address],
      settings: [adapterBlacklistSettings],
    });

    // create new fund with policy as above
    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig: adapterBlacklistConfigData,
    });

    // migrate fund
    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      policyManagerConfigData: adapterBlacklistConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Migration execution settles the accrued fee
    await signedNextFundDeployer.executeMigration(vaultProxy);

    const kyberArgs = kyberTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAsset: denominationAsset,
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const kyberCallArgs = callOnIntegrationArgs({
      adapter: kyberAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: kyberArgs,
    });

    const kyberTx = nextComptrollerProxy
      .connect(fundOwner)
      .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, kyberCallArgs);

    await expect(kyberTx).rejects.toBeRevertedWith('Rule evaluated to false: ADAPTER_BLACKLIST');
  });
});
