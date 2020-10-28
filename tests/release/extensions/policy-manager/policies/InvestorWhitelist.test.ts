import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { InvestorWhitelist } from '@melonproject/protocol';
import {
  defaultTestDeployment,
  assertEvent,
  policyHooks,
  investorWhitelistArgs,
  validateRulePreBuySharesArgs,
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
  const investorWhitelist = await InvestorWhitelist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    investorWhitelist,
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
    whitelistedInvestors: [randomAddress(), randomAddress()],
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    comptrollerProxy,
    EOAPolicyManager,
    investorWhitelist,
    whitelistedInvestors,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedInvestorWhitelist = investorWhitelist.connect(
    EOAPolicyManager,
  );
  const investorWhitelistConfig = await investorWhitelistArgs({
    investorsToAdd: whitelistedInvestors,
  });

  await permissionedInvestorWhitelist.addFundSettings(
    comptrollerProxy,
    investorWhitelistConfig,
  );

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

    const getPolicyManagerCall = investorWhitelist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const implementedHooksCall = investorWhitelist.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      policyHooks.PreBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      comptrollerProxy,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });
    const addFundSettingsTx = investorWhitelist.addFundSettings(
      comptrollerProxy,
      investorWhitelistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });
    const addFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, investorWhitelistConfig);

    // List should be the whitelisted investors
    const getListCall = investorWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(whitelistedInvestors);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedInvestors,
    });
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToAdd: [randomAddress()],
    });
    const updateFundSettingsTx = investorWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      investorWhitelistConfig,
    );

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('correctly handles adding items only', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const investorsToAdd = [randomAddress(), randomAddress()];
    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToAdd,
    });
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(
        comptrollerProxy,
        randomAddress(),
        investorWhitelistConfig,
      );
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should include both previous whitelisted investors and new investors
    const getListCall = investorWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject([
      ...whitelistedInvestors,
      ...investorsToAdd,
    ]);

    // Assert the AddressesAdded event was emitted
    await assertEvent(updateFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });
  });

  it('correctly handles removing items only', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToRemove: [investorToRemove],
    });
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(
        comptrollerProxy,
        randomAddress(),
        investorWhitelistConfig,
      );
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should remove investor from previously whitelisted investors
    const getListCall = investorWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(remainingInvestors);

    // Assert the AddressesRemoved event was emitted
    await assertEvent(updateFundSettingsTx, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });
  });

  it('correctly handles both adding and removing items', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newInvestor = randomAddress();
    const overlappingInvestor = randomAddress();
    const investorsToAdd = [newInvestor, overlappingInvestor];
    const investorsToRemove = [investorToRemove, overlappingInvestor];

    const investorWhitelistConfig = await investorWhitelistArgs({
      investorsToAdd,
      investorsToRemove,
    });
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(
        comptrollerProxy,
        randomAddress(),
        investorWhitelistConfig,
      );
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // Final list should have removed one investor and added one investor
    const getListCall = investorWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject([
      newInvestor,
      ...remainingInvestors,
    ]);
  });
});

describe('validateRule', () => {
  it('returns true if an investor is in the whitelist', async () => {
    const {
      comptrollerProxy,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = await validateRulePreBuySharesArgs({
      buyer: whitelistedInvestors[0], // good buyer
    });
    const validateRuleCall = investorWhitelist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreBuyShares,
        preBuySharesArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if an investor is not in the whitelist', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = await validateRulePreBuySharesArgs({
      buyer: randomAddress(), // bad buyer
    });
    const validateRuleCall = investorWhitelist.validateRule
      .args(
        comptrollerProxy,
        randomAddress(),
        policyHooks.PreBuyShares,
        preBuySharesArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
