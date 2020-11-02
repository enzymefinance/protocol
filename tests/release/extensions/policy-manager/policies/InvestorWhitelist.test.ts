import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import {
  InvestorWhitelist,
  investorWhitelistArgs,
  PolicyHook,
  validateRulePreBuySharesArgs,
} from '@melonproject/protocol';
import { defaultTestDeployment, assertEvent } from '@melonproject/testutils';

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

  const investorWhitelist = await InvestorWhitelist.deploy(config.deployer, EOAPolicyManager);

  return {
    accounts: remainingAccounts,
    investorWhitelist,
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
    whitelistedInvestors: [randomAddress(), randomAddress()],
  };
}

async function snapshotWithConfiguredStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts,
    comptrollerProxy,
    EOAPolicyManager,
    investorWhitelist,
    whitelistedInvestors,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedInvestorWhitelist = investorWhitelist.connect(EOAPolicyManager);

  const investorWhitelistConfig = investorWhitelistArgs({
    investorsToAdd: whitelistedInvestors,
  });

  await permissionedInvestorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

  return {
    accounts,
    comptrollerProxy,
    EOAPolicyManager,
    investorWhitelist: permissionedInvestorWhitelist,
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
    const { comptrollerProxy, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    await expect(investorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { comptrollerProxy, EOAPolicyManager, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    const receipt = await investorWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, investorWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedInvestors,
    });

    // List should be the whitelisted investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchObject(whitelistedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(snapshotWithStandalonePolicy);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      investorWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const { comptrollerProxy, EOAPolicyManager, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    const investorsToAdd = [randomAddress(), randomAddress()];
    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
    });

    const receipt = await investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous whitelisted investors and new investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchObject([...whitelistedInvestors, ...investorsToAdd]);
  });

  it('correctly handles removing items only', async () => {
    const { comptrollerProxy, EOAPolicyManager, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig);

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously whitelisted investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchObject(remainingInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const { comptrollerProxy, EOAPolicyManager, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

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

    await investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig);

    // Final list should have removed one investor and added one investor
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchObject([newInvestor, ...remainingInvestors]);
  });
});

describe('validateRule', () => {
  it('returns true if an investor is in the whitelist', async () => {
    const { comptrollerProxy, investorWhitelist, whitelistedInvestors } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: whitelistedInvestors[0], // good buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await investorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBeTruthy();
  });

  it('returns false if an investor is not in the whitelist', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(), // bad buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await investorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBeFalsy();
  });
});

describe('integration tests', () => {
  it.todo('can create a new fund with this policy, and it works correctly during callOnIntegration');

  it.todo('can create a migrated fund with this policy');
});
