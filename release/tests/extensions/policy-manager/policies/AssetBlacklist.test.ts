import { constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { AssetBlacklist, ComptrollerLib } from '../../../../utils/contracts';
import {
  assetBlacklistArgs,
  policyHooks,
  policyHookExecutionTimes,
  validateRulePreCoIArgs,
} from '../../../utils';

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
  const assetBlacklist = await AssetBlacklist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  const denominationAssetAddress = randomAddress();
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(
    denominationAssetAddress,
  );

  return {
    accounts: remainingAccounts,
    assetBlacklist,
    blacklistedAssets: [randomAddress(), randomAddress()],
    denominationAssetAddress,
    EOAPolicyManager,
    mockComptrollerProxy,
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    assetBlacklist,
    blacklistedAssets,
    mockComptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetBlacklist = assetBlacklist.connect(EOAPolicyManager);
  const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
  await permissionedAssetBlacklist.addFundSettings(
    mockComptrollerProxy,
    assetBlacklistConfig,
  );

  return {
    accounts,
    assetBlacklist: permissionedAssetBlacklist,
    blacklistedAssets,
    EOAPolicyManager,
    mockComptrollerProxy,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, assetBlacklist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = assetBlacklist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const policyHookCall = assetBlacklist.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.CallOnIntegration);

    const policyHookExecutionTimeCall = assetBlacklist.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Pre,
    );
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist.addFundSettings(
      mockComptrollerProxy,
      assetBlacklistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow the denomination asset to be blacklisted', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      denominationAssetAddress,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs([
      ...blacklistedAssets,
      denominationAssetAddress,
    ]);
    const addFundSettingsTx = assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'cannot blacklist denominationAsset',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    // List should be the blacklisted assets
    const getListCall = assetBlacklist.getList(mockComptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(blacklistedAssets);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy.address,
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
      mockComptrollerProxy,
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
    const validateRuleCall = assetBlacklist.validateRule
      .args(mockComptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if an asset is not in the blacklist', async () => {
    const { assetBlacklist, mockComptrollerProxy } = await provider.snapshot(
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
    const validateRuleCall = assetBlacklist.validateRule
      .args(mockComptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });
});
