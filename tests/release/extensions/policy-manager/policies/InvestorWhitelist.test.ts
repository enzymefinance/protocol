import { randomAddress } from '@enzymefinance/ethers';
import {
  InvestorWhitelist,
  investorWhitelistArgs,
  PolicyHook,
  policyManagerConfigArgs,
  validateRulePreBuySharesArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createFundDeployer,
  createMigratedFundConfig,
  deployProtocolFixture,
} from '@enzymefinance/testutils';

async function snapshot() {
  const { deployer, accounts, deployment, config } = await deployProtocolFixture();

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const comptrollerProxy = randomAddress();
  const whitelistedInvestors = [randomAddress(), randomAddress()];

  const investorWhitelist1 = await InvestorWhitelist.deploy(deployer, EOAPolicyManager);
  const permissionedInvestorWhitelist = investorWhitelist1.connect(EOAPolicyManager);

  const investorWhitelist2 = await InvestorWhitelist.deploy(deployer, EOAPolicyManager);
  const configuredInvestorWhitelist = investorWhitelist2.connect(EOAPolicyManager);

  const investorWhitelistConfig = investorWhitelistArgs({
    investorsToAdd: whitelistedInvestors,
  });

  await configuredInvestorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    comptrollerProxy,
    config,
    configuredInvestorWhitelist,
    deployment,
    permissionedInvestorWhitelist,
    whitelistedInvestors,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, investorWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await investorWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await investorWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PreBuyShares]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { investorWhitelist },
      comptrollerProxy,
      whitelistedInvestors,
    } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    await expect(investorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { comptrollerProxy, permissionedInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    const receipt = await permissionedInvestorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedInvestors,
    });

    // List should be the whitelisted investors
    const getListCall = await permissionedInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(permissionedInvestorWhitelist.getList, whitelistedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const {
      deployment: { investorWhitelist },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      investorWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const investorsToAdd = [randomAddress(), randomAddress()];
    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
    });

    const receipt = await configuredInvestorWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      investorWhitelistConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous whitelisted investors and new investors
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(
      configuredInvestorWhitelist.getList,
      whitelistedInvestors.concat(investorsToAdd),
    );
  });

  it('correctly handles removing items only', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await configuredInvestorWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      investorWhitelistConfig,
    );

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously whitelisted investors
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredInvestorWhitelist.getList, remainingInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newInvestor = randomAddress();
    const overlappingInvestor = randomAddress();
    const investorsToAdd = [newInvestor, overlappingInvestor];
    const investorsToRemove = [investorToRemove, overlappingInvestor];

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
      investorsToRemove,
    });

    await configuredInvestorWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig);

    // Final list should have removed one investor and added one investor
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredInvestorWhitelist.getList, [
      newInvestor,
      ...remainingInvestors,
    ]);
  });
});

describe('validateRule', () => {
  it('returns true if an investor is in the whitelist', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: whitelistedInvestors[0], // good buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await configuredInvestorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an investor is not in the whitelist', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist } = await provider.snapshot(snapshot);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(), // bad buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await configuredInvestorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});

describe('integration tests', () => {
  it('can create a new fund with this policy, and it can disable and re-enable the policy for that fund', async () => {
    const {
      config,
      accounts: [fundOwner],
      deployment: { fundDeployer, investorWhitelist, policyManager },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(config.weth, whales.weth);

    // declare variables for policy config
    const investorWhitelistAddresses = [randomAddress(), randomAddress(), randomAddress()];
    const investorWhitelistSettings = investorWhitelistArgs({ investorsToAdd: investorWhitelistAddresses });
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [investorWhitelist.address],
      settings: [investorWhitelistSettings],
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
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [investorWhitelist]);

    // disable investor whitelist and confirm there are no policies enabled
    await policyManager.connect(fundOwner).disablePolicyForFund(comptrollerProxy, investorWhitelist);
    const confirmDisabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy.address);
    expect(confirmDisabledPolicies).toHaveLength(0);

    // re-enable policy with additional settingsData
    const newInvestors = [randomAddress(), randomAddress()];
    const reEnableInvestorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: newInvestors,
    });

    await policyManager
      .connect(fundOwner)
      .enablePolicyForFund(comptrollerProxy, investorWhitelist, reEnableInvestorWhitelistConfig);

    // confirm that the policy has been re-enabled for fund
    const confirmReEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy.address);
    expect(confirmReEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [
      investorWhitelist,
    ]);

    // confirm that the members of the re-enabled whitelist are either in the initial config or the additionalSettings data
    const totalInvestors = investorWhitelistAddresses.concat(newInvestors);
    const confirmWhitelistMembers = await investorWhitelist.getList(comptrollerProxy.address);
    expect(confirmWhitelistMembers).toMatchFunctionOutput(investorWhitelist.getList, totalInvestors);
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
        investorWhitelist,
      },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);

    // declare variables for policy config
    const investorWhitelistAddresses = [randomAddress(), randomAddress(), randomAddress()];
    const investorWhitelistSettings = investorWhitelistArgs({ investorsToAdd: investorWhitelistAddresses });
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [investorWhitelist.address],
      settings: [investorWhitelistSettings],
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
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [investorWhitelist]);
  });
});
