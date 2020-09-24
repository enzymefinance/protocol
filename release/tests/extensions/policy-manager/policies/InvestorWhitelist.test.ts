// import { utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { InvestorWhitelist } from '../../../../utils/contracts';
import {
  policyHooks,
  policyHookExecutionTimes,
  investorWhitelistConfigArgs,
  investorWhitelistUpdateArgs,
  validateRulePreBuySharesArgs,
} from '../../../utils';

async function snapshot(provider: BuidlerProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithStandalonePolicy(provider: BuidlerProvider) {
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
  provider: BuidlerProvider,
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
  const investorWhitelistConfig = await investorWhitelistConfigArgs(
    whitelistedInvestors,
  );
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

    const policyHookCall = investorWhitelist.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.BuyShares);

    const policyHookExecutionTimeCall = investorWhitelist.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Pre,
    );
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      comptrollerProxy,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const investorWhitelistConfig = await investorWhitelistConfigArgs(
      whitelistedInvestors,
    );
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

    const investorWhitelistConfig = await investorWhitelistConfigArgs(
      whitelistedInvestors,
    );
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
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const investorWhitelistUpdateConfig = await investorWhitelistUpdateArgs(
      [randomAddress()],
      [],
    );
    const updateFundSettingsTx = investorWhitelist.updateFundSettings(
      comptrollerProxy,
      investorWhitelistUpdateConfig,
    );

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow both empty add and remove args', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const investorWhitelistUpdateConfig = await investorWhitelistUpdateArgs(
      [],
      [],
    );
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, investorWhitelistUpdateConfig);

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'must pass addresses to add or remove',
    );
  });

  it('correctly handles adding items only', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      investorWhitelist,
      whitelistedInvestors,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const newInvestors = [randomAddress(), randomAddress()];
    const investorWhitelistUpdateConfig = await investorWhitelistUpdateArgs(
      newInvestors,
      [],
    );
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, investorWhitelistUpdateConfig);
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should include both previous whitelisted investors and new investors
    const getListCall = investorWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject([
      ...whitelistedInvestors,
      ...newInvestors,
    ]);

    // Assert the AddressesAdded event was emitted
    await assertEvent(updateFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: newInvestors,
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

    const investorWhitelistUpdateConfig = await investorWhitelistUpdateArgs(
      [],
      [investorToRemove],
    );
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, investorWhitelistUpdateConfig);
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

    const investorWhitelistUpdateConfig = await investorWhitelistUpdateArgs(
      investorsToAdd,
      investorsToRemove,
    );
    const updateFundSettingsTx = investorWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, investorWhitelistUpdateConfig);
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
    const preBuySharesArgs = await validateRulePreBuySharesArgs(
      whitelistedInvestors[0], // good buyer
      0,
      0,
    );
    const validateRuleCall = investorWhitelist.validateRule
      .args(comptrollerProxy, preBuySharesArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if an investor is not in the whitelist', async () => {
    const { comptrollerProxy, investorWhitelist } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = await validateRulePreBuySharesArgs(
      randomAddress(), // bad buyer
      0,
      0,
    );
    const validateRuleCall = investorWhitelist.validateRule
      .args(comptrollerProxy, preBuySharesArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
