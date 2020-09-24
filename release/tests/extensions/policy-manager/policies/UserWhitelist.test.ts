// import { utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { UserWhitelist } from '../../../../utils/contracts';
import {
  policyHooks,
  policyHookExecutionTimes,
  userWhitelistConfigArgs,
  userWhitelistUpdateArgs,
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
  const userWhitelist = await UserWhitelist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    userWhitelist,
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
    whitelistedUsers: [randomAddress(), randomAddress()],
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: BuidlerProvider,
) {
  const {
    accounts,
    comptrollerProxy,
    EOAPolicyManager,
    userWhitelist,
    whitelistedUsers,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedUserWhitelist = userWhitelist.connect(EOAPolicyManager);
  const userWhitelistConfig = await userWhitelistConfigArgs(whitelistedUsers);
  await permissionedUserWhitelist.addFundSettings(
    comptrollerProxy,
    userWhitelistConfig,
  );

  return {
    accounts,
    comptrollerProxy,
    EOAPolicyManager,
    userWhitelist: permissionedUserWhitelist,
    whitelistedUsers,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, userWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = userWhitelist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const policyHookCall = userWhitelist.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.BuyShares);

    const policyHookExecutionTimeCall = userWhitelist.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Pre,
    );
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      comptrollerProxy,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const userWhitelistConfig = await userWhitelistConfigArgs(whitelistedUsers);
    const addFundSettingsTx = userWhitelist.addFundSettings(
      comptrollerProxy,
      userWhitelistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const userWhitelistConfig = await userWhitelistConfigArgs(whitelistedUsers);
    const addFundSettingsTx = userWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, userWhitelistConfig);

    // List should be the whitelisted users
    const getListCall = userWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(whitelistedUsers);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedUsers,
    });
  });
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const { comptrollerProxy, userWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const userWhitelistUpdateConfig = await userWhitelistUpdateArgs(
      [randomAddress()],
      [],
    );
    const updateFundSettingsTx = userWhitelist.updateFundSettings(
      comptrollerProxy,
      userWhitelistUpdateConfig,
    );

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow both empty add and remove args', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      userWhitelist,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const userWhitelistUpdateConfig = await userWhitelistUpdateArgs([], []);
    const updateFundSettingsTx = userWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, userWhitelistUpdateConfig);

    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'must pass addresses to add or remove',
    );
  });

  it('correctly handles adding items only', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const newUsers = [randomAddress(), randomAddress()];
    const userWhitelistUpdateConfig = await userWhitelistUpdateArgs(
      newUsers,
      [],
    );
    const updateFundSettingsTx = userWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, userWhitelistUpdateConfig);
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should include both previous whitelisted users and new users
    const getListCall = userWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject([
      ...whitelistedUsers,
      ...newUsers,
    ]);

    // Assert the AddressesAdded event was emitted
    await assertEvent(updateFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: newUsers,
    });
  });

  it('correctly handles removing items only', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const [userToRemove, ...remainingUsers] = whitelistedUsers;

    const userWhitelistUpdateConfig = await userWhitelistUpdateArgs(
      [],
      [userToRemove],
    );
    const updateFundSettingsTx = userWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, userWhitelistUpdateConfig);
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // List should remove user from previously whitelisted users
    const getListCall = userWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(remainingUsers);

    // Assert the AddressesRemoved event was emitted
    await assertEvent(updateFundSettingsTx, 'AddressesRemoved', {
      comptrollerProxy,
      items: [userToRemove],
    });
  });

  it('correctly handles both adding and removing items', async () => {
    const {
      comptrollerProxy,
      EOAPolicyManager,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    const [userToRemove, ...remainingUsers] = whitelistedUsers;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newUser = randomAddress();
    const overlappingUser = randomAddress();
    const usersToAdd = [newUser, overlappingUser];
    const usersToRemove = [userToRemove, overlappingUser];

    const userWhitelistUpdateConfig = await userWhitelistUpdateArgs(
      usersToAdd,
      usersToRemove,
    );
    const updateFundSettingsTx = userWhitelist
      .connect(EOAPolicyManager)
      .updateFundSettings(comptrollerProxy, userWhitelistUpdateConfig);
    await expect(updateFundSettingsTx).resolves.toBeReceipt();

    // Final list should have removed one user and added one user
    const getListCall = userWhitelist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject([
      newUser,
      ...remainingUsers,
    ]);
  });
});

describe('validateRule', () => {
  it('returns true if a user is in the whitelist', async () => {
    const {
      comptrollerProxy,
      userWhitelist,
      whitelistedUsers,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = await validateRulePreBuySharesArgs(
      whitelistedUsers[0], // good buyer
      0,
      0,
    );
    const validateRuleCall = userWhitelist.validateRule
      .args(comptrollerProxy, preBuySharesArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if a user is not in the whitelist', async () => {
    const { comptrollerProxy, userWhitelist } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = await validateRulePreBuySharesArgs(
      randomAddress(), // bad buyer
      0,
      0,
    );
    const validateRuleCall = userWhitelist.validateRule
      .args(comptrollerProxy, preBuySharesArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
