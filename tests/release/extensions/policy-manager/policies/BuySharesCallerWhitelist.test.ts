import { utils } from 'ethers';
import { randomAddress } from '@enzymefinance/ethers';
import {
  BuySharesCallerWhitelist,
  buySharesCallerWhitelistArgs,
  PolicyHook,
  policyManagerConfigArgs,
  validateRuleBuySharesSetupArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  buyShares,
  createNewFund,
  createFundDeployer,
  createMigratedFundConfig,
  deployProtocolFixture,
} from '@enzymefinance/testutils';

async function snapshot() {
  const { deployer, accounts, deployment, config } = await deployProtocolFixture();

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const comptrollerProxy = randomAddress();
  const whitelistedCallers = [randomAddress(), randomAddress()];

  const buySharesCallerWhitelist1 = await BuySharesCallerWhitelist.deploy(deployer, EOAPolicyManager);
  const unconfiguredBuySharesCallerWhitelist = buySharesCallerWhitelist1.connect(EOAPolicyManager);

  const buySharesCallerWhitelist2 = await BuySharesCallerWhitelist.deploy(deployer, EOAPolicyManager);
  const configuredBuySharesCallerWhitelist = buySharesCallerWhitelist2.connect(EOAPolicyManager);

  const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
    buySharesCallersToAdd: whitelistedCallers,
  });

  await configuredBuySharesCallerWhitelist.addFundSettings(comptrollerProxy, buySharesCallerWhitelistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    comptrollerProxy,
    config,
    unconfiguredBuySharesCallerWhitelist,
    deployment,
    configuredBuySharesCallerWhitelist,
    whitelistedCallers,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, buySharesCallerWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await buySharesCallerWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await buySharesCallerWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.BuySharesSetup]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { buySharesCallerWhitelist },
      comptrollerProxy,
      whitelistedCallers,
    } = await provider.snapshot(snapshot);

    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: whitelistedCallers,
    });

    await expect(
      buySharesCallerWhitelist.addFundSettings(comptrollerProxy, buySharesCallerWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { comptrollerProxy, unconfiguredBuySharesCallerWhitelist, whitelistedCallers } = await provider.snapshot(
      snapshot,
    );

    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: whitelistedCallers,
    });

    const receipt = await unconfiguredBuySharesCallerWhitelist.addFundSettings(
      comptrollerProxy,
      buySharesCallerWhitelistConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedCallers,
    });

    // List should be the whitelisted callers
    const getListCall = await unconfiguredBuySharesCallerWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(unconfiguredBuySharesCallerWhitelist.getList, whitelistedCallers);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const {
      deployment: { buySharesCallerWhitelist },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: [randomAddress()],
    });

    await expect(
      buySharesCallerWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), buySharesCallerWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const { comptrollerProxy, configuredBuySharesCallerWhitelist, whitelistedCallers } = await provider.snapshot(
      snapshot,
    );

    const buySharesCallersToAdd = [randomAddress(), randomAddress()];
    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd,
    });

    const receipt = await configuredBuySharesCallerWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      buySharesCallerWhitelistConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: buySharesCallersToAdd,
    });

    // List should include both previous whitelisted callers and new callers
    const getListCall = await configuredBuySharesCallerWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(
      configuredBuySharesCallerWhitelist.getList,
      whitelistedCallers.concat(buySharesCallersToAdd),
    );
  });

  it('correctly handles removing items only', async () => {
    const { comptrollerProxy, configuredBuySharesCallerWhitelist, whitelistedCallers } = await provider.snapshot(
      snapshot,
    );

    const [callerToRemove, ...remainingCallers] = whitelistedCallers;

    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToRemove: [callerToRemove],
    });

    const receipt = await configuredBuySharesCallerWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      buySharesCallerWhitelistConfig,
    );

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [callerToRemove],
    });

    // List should remove caller from previously whitelisted callers
    const getListCall = await configuredBuySharesCallerWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredBuySharesCallerWhitelist.getList, remainingCallers);
  });

  it('correctly handles both adding and removing items', async () => {
    const { comptrollerProxy, configuredBuySharesCallerWhitelist, whitelistedCallers } = await provider.snapshot(
      snapshot,
    );

    const [callerToRemove, ...remainingCallers] = whitelistedCallers;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newCaller = randomAddress();
    const overlappingCaller = randomAddress();
    const buySharesCallersToAdd = [newCaller, overlappingCaller];
    const buySharesCallersToRemove = [callerToRemove, overlappingCaller];

    const buySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd,
      buySharesCallersToRemove,
    });

    await configuredBuySharesCallerWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      buySharesCallerWhitelistConfig,
    );

    // Final list should have removed one caller and added one caller
    const getListCall = await configuredBuySharesCallerWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredBuySharesCallerWhitelist.getList, [
      newCaller,
      ...remainingCallers,
    ]);
  });
});

describe('validateRule', () => {
  it('returns true if an caller is in the whitelist', async () => {
    const { comptrollerProxy, configuredBuySharesCallerWhitelist, whitelistedCallers } = await provider.snapshot(
      snapshot,
    );

    // Only the caller arg matters for this policy
    const buySharesSetupArgs = validateRuleBuySharesSetupArgs({
      caller: whitelistedCallers[0], // good caller
      fundGav: 0,
      investmentAmounts: [1],
    });

    const validateRuleCall = await configuredBuySharesCallerWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.BuySharesSetup, buySharesSetupArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an caller is not in the whitelist', async () => {
    const { comptrollerProxy, configuredBuySharesCallerWhitelist } = await provider.snapshot(snapshot);

    // Only the caller arg matters for this policy
    const buySharesSetupArgs = validateRuleBuySharesSetupArgs({
      caller: randomAddress(), // bad caller
      fundGav: 0,
      investmentAmounts: [1],
    });

    const validateRuleCall = await configuredBuySharesCallerWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.BuySharesSetup, buySharesSetupArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('returns false if the whitelist is empty', async () => {
    const { comptrollerProxy, unconfiguredBuySharesCallerWhitelist } = await provider.snapshot(snapshot);

    // Enable the policy with an empty whitelist
    await unconfiguredBuySharesCallerWhitelist.addFundSettings(comptrollerProxy, buySharesCallerWhitelistArgs());

    // Only the caller arg matters for this policy
    const buySharesSetupArgs = validateRuleBuySharesSetupArgs({
      caller: randomAddress(), // any caller is a bad caller
      fundGav: 0,
      investmentAmounts: [1],
    });

    const validateRuleCall = await unconfiguredBuySharesCallerWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.BuySharesSetup, buySharesSetupArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});

describe('integration tests', () => {
  it('only allows a whitelisted sender to call buyShares()', async () => {
    const {
      config: { weth },
      accounts: [fundOwner, whitelistedCaller, unWhitelistedCaller],
      deployment: { fundDeployer, buySharesCallerWhitelist },
    } = await provider.snapshot(snapshot);

    const sharesBuyer = randomAddress();
    const investmentAmount = utils.parseEther('1');
    const denominationAsset = new WETH(weth, whales.weth);
    await denominationAsset.transfer(whitelistedCaller, investmentAmount);

    // declare variables for policy config
    const buySharesCallerWhitelistAddresses = [randomAddress(), whitelistedCaller];
    const buySharesCallerWhitelistSettings = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: buySharesCallerWhitelistAddresses,
    });

    const policyManagerConfig = policyManagerConfigArgs({
      policies: [buySharesCallerWhitelist.address],
      settings: [buySharesCallerWhitelistSettings],
    });

    // create new fund with policy as above
    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig,
    });

    // define basic args for buyShares call
    const buySharesArgs = {
      comptrollerProxy,
      denominationAsset,
      buyers: [sharesBuyer],
      investmentAmounts: [investmentAmount],
    };

    // Buying shares for a random buyer should fail from the unWhitelisted caller
    await expect(
      buyShares({
        ...buySharesArgs,
        signer: unWhitelistedCaller,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: BUY_SHARES_CALLER_WHITELIST');

    // Buying shares for a random buyer should succeed from the whitelisted caller
    await expect(
      buyShares({
        ...buySharesArgs,
        signer: whitelistedCaller,
      }),
    ).resolves.toBeReceipt();
  });

  it('can create a new fund with this policy, and it can disable and re-enable the policy for that fund', async () => {
    const {
      config: { weth },
      accounts: [fundOwner],
      deployment: { fundDeployer, buySharesCallerWhitelist, policyManager },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);

    // declare variables for policy config
    const buySharesCallerWhitelistAddresses = [randomAddress(), randomAddress(), randomAddress()];
    const buySharesCallerWhitelistSettings = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: buySharesCallerWhitelistAddresses,
    });
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [buySharesCallerWhitelist.address],
      settings: [buySharesCallerWhitelistSettings],
    });

    // create new fund with policy as above
    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig,
    });

    // confirm the policy has been enabled on fund creation
    const confirmEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy.address);
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [
      buySharesCallerWhitelist,
    ]);

    // disable caller whitelist and confirm there are no policies enabled
    await policyManager.connect(fundOwner).disablePolicyForFund(comptrollerProxy, buySharesCallerWhitelist);
    const confirmDisabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy.address);
    expect(confirmDisabledPolicies).toHaveLength(0);

    // re-enable policy with additional settingsData
    const newCallers = [randomAddress(), randomAddress()];
    const reEnableBuySharesCallerWhitelistConfig = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: newCallers,
    });

    await policyManager
      .connect(fundOwner)
      .enablePolicyForFund(comptrollerProxy, buySharesCallerWhitelist, reEnableBuySharesCallerWhitelistConfig);

    // confirm that the policy has been re-enabled for fund
    const confirmReEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy.address);
    expect(confirmReEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [
      buySharesCallerWhitelist,
    ]);

    // confirm that the members of the re-enabled whitelist are either in the initial config or the additionalSettings data
    const totalCallers = buySharesCallerWhitelistAddresses.concat(newCallers);
    const confirmWhitelistMembers = await buySharesCallerWhitelist.getList(comptrollerProxy.address);
    expect(confirmWhitelistMembers).toMatchFunctionOutput(buySharesCallerWhitelist.getList, totalCallers);
  });

  it('can create a migrated fund with this policy', async () => {
    const {
      accounts: [fundOwner],
      deployer,
      config: {
        weth,
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
        buySharesCallerWhitelist,
      },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);

    // declare variables for policy config
    const buySharesCallerWhitelistAddresses = [randomAddress(), randomAddress(), randomAddress()];
    const buySharesCallerWhitelistSettings = buySharesCallerWhitelistArgs({
      buySharesCallersToAdd: buySharesCallerWhitelistAddresses,
    });

    const policyManagerConfig = policyManagerConfigArgs({
      policies: [buySharesCallerWhitelist.address],
      settings: [buySharesCallerWhitelistSettings],
    });

    // create new fund with policy as above
    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig,
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
      policyManagerConfigData: policyManagerConfig,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Migration execution settles the accrued fee
    await signedNextFundDeployer.executeMigration(vaultProxy);

    // confirm policy exists on migrated fund
    const confirmEnabledPolicies = await policyManager.getEnabledPoliciesForFund(nextComptrollerProxy.address);
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [
      buySharesCallerWhitelist,
    ]);
  });
});
