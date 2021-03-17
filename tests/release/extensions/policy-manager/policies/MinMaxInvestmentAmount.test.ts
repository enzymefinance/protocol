import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  MinMaxInvestment,
  minMaxInvestmentArgs,
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
import { BigNumberish, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment,
    config,
    accounts: [EOAPolicyManager, ...remainingAccounts],
  } = await deployProtocolFixture();

  const minMaxInvestment = await MinMaxInvestment.deploy(deployer, EOAPolicyManager);
  const permissionedMinMaxInvestment = minMaxInvestment.connect(EOAPolicyManager);
  const denominationAsset = new WETH(config.weth, whales.weth);

  return {
    deployer,
    denominationAsset,
    accounts: remainingAccounts,
    deployment,
    config,
    comptrollerProxy: randomAddress(),
    permissionedMinMaxInvestment,
  };
}

async function addFundSettings({
  comptrollerProxy,
  permissionedMinMaxInvestment,
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  comptrollerProxy: AddressLike;
  permissionedMinMaxInvestment: MinMaxInvestment;
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  const minMaxInvestmentConfig = minMaxInvestmentArgs({
    minInvestmentAmount,
    maxInvestmentAmount,
  });

  await permissionedMinMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, minMaxInvestment },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await minMaxInvestment.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await minMaxInvestment.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PreBuyShares]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { minMaxInvestment },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    await expect(minMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    {
      const minMaxInvestmentConfig = minMaxInvestmentArgs({
        minInvestmentAmount: utils.parseEther('1'),
        maxInvestmentAmount: utils.parseEther('1'),
      });

      await expect(
        permissionedMinMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig),
      ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
    }

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('2'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    await expect(
      permissionedMinMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    const minInvestmentAmount = utils.parseEther('1');
    const maxInvestmentAmount = utils.parseEther('2');

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const receipt = await permissionedMinMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const fundSettings = await permissionedMinMaxInvestment.getFundSettings(comptrollerProxy);

    expect(fundSettings).toMatchFunctionOutput(permissionedMinMaxInvestment.getFundSettings, {
      minInvestmentAmount,
      maxInvestmentAmount,
    });
  });
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const {
      deployment: { minMaxInvestment },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    await expect(
      minMaxInvestment.updateFundSettings(comptrollerProxy, randomAddress(), minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    {
      const minMaxInvestmentConfig = minMaxInvestmentArgs({
        minInvestmentAmount: utils.parseEther('1'),
        maxInvestmentAmount: utils.parseEther('1'),
      });

      await expect(
        permissionedMinMaxInvestment.updateFundSettings(comptrollerProxy, randomAddress(), minMaxInvestmentConfig),
      ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
    }
    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('2'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    await expect(
      permissionedMinMaxInvestment.updateFundSettings(comptrollerProxy, randomAddress(), minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
  });

  it('updates config values for fund and fires events', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    const minInvestmentAmount = utils.parseEther('3');
    const maxInvestmentAmount = utils.parseEther('4');

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const receipt = await permissionedMinMaxInvestment.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      minMaxInvestmentConfig,
    );

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const fundSettings = await permissionedMinMaxInvestment.getFundSettings(comptrollerProxy);
    expect(fundSettings).toMatchFunctionOutput(permissionedMinMaxInvestment.getFundSettings, {
      minInvestmentAmount,
      maxInvestmentAmount,
    });
  });
});

describe('validateRule', () => {
  it('returns true if the investmentAmount is within bounds', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    await addFundSettings({
      comptrollerProxy,
      permissionedMinMaxInvestment,
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    // Only the investmentAmount arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1'),
      minSharesQuantity: 1,
    });

    const validateRuleCall = await permissionedMinMaxInvestment.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if the investmentAmount is out of bounds', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    await addFundSettings({
      comptrollerProxy,
      permissionedMinMaxInvestment,
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    // Only the investmentAmount arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('3'),
      minSharesQuantity: 1,
    });

    const validateRuleCall = await permissionedMinMaxInvestment.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('returns false if both the minInvestmentAmount and maxInvestmentAmount equal to 0 (can be used to temporarily close the fund) unless investmentAmount is 0', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    await addFundSettings({
      comptrollerProxy,
      permissionedMinMaxInvestment,
      minInvestmentAmount: utils.parseEther('0'),
      maxInvestmentAmount: utils.parseEther('0'),
    });

    // Only the investmentAmount arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1'),
      minSharesQuantity: 1,
    });

    const validateRuleCall = await permissionedMinMaxInvestment.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('correctly handles when minInvestmentAmount equals to 0', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    await addFundSettings({
      comptrollerProxy,
      permissionedMinMaxInvestment,
      minInvestmentAmount: utils.parseEther('0'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    {
      // Only the investmentAmount arg matters for this policy
      const preBuySharesArgs = validateRulePreBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('1.5'),
        minSharesQuantity: 1,
      });

      const validateRuleCall = await permissionedMinMaxInvestment.validateRule
        .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
        .call();

      expect(validateRuleCall).toBe(false);
    }

    // Only the investmentAmount arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('0.5'),
      minSharesQuantity: 1,
    });

    const validateRuleCall = await permissionedMinMaxInvestment.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('correctly handles when maxInvestmentAmount equals to 0', async () => {
    const { comptrollerProxy, permissionedMinMaxInvestment } = await provider.snapshot(snapshot);

    await addFundSettings({
      comptrollerProxy,
      permissionedMinMaxInvestment,
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('0'),
    });

    {
      // Only the investmentAmount arg matters for this policy
      const preBuySharesArgs = validateRulePreBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('0.5'),
        minSharesQuantity: 1,
      });

      const validateRuleCall = await permissionedMinMaxInvestment.validateRule
        .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
        .call();

      expect(validateRuleCall).toBe(false);
    }

    // Only the investmentAmount arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1.5'),
      minSharesQuantity: 1,
    });

    const validateRuleCall = await permissionedMinMaxInvestment.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });
});

describe('integration tests', () => {
  it('can create a new fund with this policy, and it can disable and re-enable the policy for that fund', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner],
      deployment: { fundDeployer, minMaxInvestment, policyManager },
    } = await provider.snapshot(snapshot);

    // declare variables for policy config
    const minMaxInvestmentSettings = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [minMaxInvestment],
      settings: [minMaxInvestmentSettings],
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
    const confirmEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy);
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [minMaxInvestment]);

    await policyManager.connect(fundOwner).disablePolicyForFund(comptrollerProxy, minMaxInvestment);
    const confirmDisabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy);
    expect(confirmDisabledPolicies).toHaveLength(0);

    // re-enable policy with empty settingsData
    const reEnableMinMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('3'),
      maxInvestmentAmount: utils.parseEther('4'),
    });

    await policyManager
      .connect(fundOwner)
      .enablePolicyForFund(comptrollerProxy, minMaxInvestment, reEnableMinMaxInvestmentConfig);

    // confirm that the policy has been re-enabled for fund
    const confirmReEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy);
    expect(confirmReEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [minMaxInvestment]);

    const confirmFundSettings = await minMaxInvestment.getFundSettings(comptrollerProxy);
    expect(confirmFundSettings).toMatchFunctionOutput(minMaxInvestment.getFundSettings, {
      minInvestmentAmount: utils.parseEther('3'),
      maxInvestmentAmount: utils.parseEther('4'),
    });
  });

  it('can create a migrated fund with this policy', async () => {
    const {
      accounts: [fundOwner],
      deployer,
      denominationAsset,
      config: {
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
        minMaxInvestment,
      },
    } = await provider.snapshot(snapshot);

    // declare variables for policy config
    const minMaxInvestmentSettings = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    const policyManagerConfig = policyManagerConfigArgs({
      policies: [minMaxInvestment],
      settings: [minMaxInvestmentSettings],
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
    const confirmEnabledPolicies = await policyManager.getEnabledPoliciesForFund(nextComptrollerProxy);
    expect(confirmEnabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, [minMaxInvestment]);
  });
});
