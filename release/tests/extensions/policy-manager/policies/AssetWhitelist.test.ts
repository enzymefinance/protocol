import { constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { AssetWhitelist, ComptrollerLib } from '../../../../utils/contracts';
import {
  assetWhitelistArgs,
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
  const assetWhitelist = await AssetWhitelist.deploy(
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
    assetWhitelist,
    denominationAssetAddress,
    EOAPolicyManager,
    mockComptrollerProxy,
    whitelistedAssets: [
      denominationAssetAddress,
      randomAddress(),
      randomAddress(),
    ],
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    assetWhitelist,
    whitelistedAssets,
    mockComptrollerProxy,
    EOAPolicyManager,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetWhitelist = assetWhitelist.connect(EOAPolicyManager);
  const assetWhitelistConfig = await assetWhitelistArgs(whitelistedAssets);
  await permissionedAssetWhitelist.addFundSettings(
    mockComptrollerProxy,
    assetWhitelistConfig,
  );

  return {
    accounts,
    assetWhitelist: permissionedAssetWhitelist,
    EOAPolicyManager,
    mockComptrollerProxy,
    whitelistedAssets,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, assetWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = assetWhitelist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const policyHookCall = assetWhitelist.policyHook();
    await expect(policyHookCall).resolves.toBe(policyHooks.CallOnIntegration);

    const policyHookExecutionTimeCall = assetWhitelist.policyHookExecutionTime();
    await expect(policyHookExecutionTimeCall).resolves.toBe(
      policyHookExecutionTimes.Pre,
    );
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      assetWhitelist,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = await assetWhitelistArgs(whitelistedAssets);
    const addFundSettingsTx = assetWhitelist.addFundSettings(
      mockComptrollerProxy,
      assetWhitelistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('requires that the denomination asset be whitelisted', async () => {
    const {
      assetWhitelist,
      denominationAssetAddress,
      EOAPolicyManager,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = await assetWhitelistArgs(
      whitelistedAssets.filter((asset) => asset != denominationAssetAddress),
    );
    const addFundSettingsTx = assetWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'must whitelist denominationAsset',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      assetWhitelist,
      whitelistedAssets,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = await assetWhitelistArgs(whitelistedAssets);
    const addFundSettingsTx = assetWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

    // List should be the whitelisted assets
    const getListCall = assetWhitelist.getList(mockComptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(whitelistedAssets);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy.address,
      items: whitelistedAssets,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = assetWhitelist.updateFundSettings(
      randomAddress(),
      '0x',
    );
    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns true if an asset is in the whitelist', async () => {
    const {
      assetWhitelist,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      utils.randomBytes(4),
      constants.AddressZero,
      [whitelistedAssets[0]], // good incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetWhitelist.validateRule
      .args(mockComptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });

  it('returns false if an asset is not in the whitelist', async () => {
    const { assetWhitelist, mockComptrollerProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Only the incoming assets arg matters for this policy
    const preCoIArgs = await validateRulePreCoIArgs(
      utils.randomBytes(4),
      constants.AddressZero,
      [randomAddress()], // bad incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetWhitelist.validateRule
      .args(mockComptrollerProxy, preCoIArgs)
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });
});
