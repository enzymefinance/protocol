import { constants, utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { AssetBlacklist } from '../../../../utils/contracts';
import { assetBlacklistArgs, validateRulePreCoIArgs } from '../../../utils';

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
  const assetBlacklist = await AssetBlacklist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  return {
    accounts: remainingAccounts,
    assetBlacklist,
    blacklistedAssets: [randomAddress(), randomAddress()],
    comptrollerProxy: randomAddress(),
    EOAPolicyManager,
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: BuidlerProvider,
) {
  const {
    accounts,
    assetBlacklist,
    blacklistedAssets,
    comptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetBlacklist = assetBlacklist.connect(EOAPolicyManager);
  const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
  await permissionedAssetBlacklist.addFundSettings(
    comptrollerProxy,
    assetBlacklistConfig,
  );

  return {
    accounts,
    assetBlacklist: permissionedAssetBlacklist,
    comptrollerProxy,
    blacklistedAssets,
    EOAPolicyManager,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, assetBlacklist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = assetBlacklist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist.addFundSettings(
      comptrollerProxy,
      assetBlacklistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      comptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, assetBlacklistConfig);

    // List should be the blacklisted assets
    const getListCall = assetBlacklist.getList(comptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(blacklistedAssets);

    // Assert the AddressesAdded event was emitted
    assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy,
      items: blacklistedAssets,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetBlacklist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = assetBlacklist.updateFundSettings(
      randomAddress(),
      '0x',
    );
    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns false if an asset is in the blacklist', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      utils.randomBytes(4),
      constants.AddressZero,
      [blacklistedAssets[0]], // bad incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetBlacklist.validateRule(
      comptrollerProxy,
      preCoIArgs,
    );
    expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if an asset is not in the blacklist', async () => {
    const { assetBlacklist, comptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the incoming assets arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      utils.randomBytes(4),
      constants.AddressZero,
      [randomAddress()], // good incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetBlacklist.validateRule(
      comptrollerProxy,
      preCoIArgs,
    );
    expect(validateRuleCall).resolves.toBeTruthy();
  });
});
