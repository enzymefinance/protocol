import { randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FundDeployer,
  IExtension,
  ReleaseStatusTypes,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, createComptrollerProxy, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [mockVaultProxyOwner, ...remainingAccounts],
    config,
    deployment,
  } = await deployProtocolFixture();

  const denominationAsset = new StandardToken(config.weth, deployer);

  // Deploy a mock FundDeployer
  const mockFundDeployer = await FundDeployer.mock(deployer);
  await mockFundDeployer.getReleaseStatus.returns(ReleaseStatusTypes.Live);

  // Deploy mock extensions
  const mockExternalPositionManager = await IExtension.mock(deployer);
  const mockFeeManager = await IExtension.mock(deployer);
  const mockIntegrationManager = await IExtension.mock(deployer);
  const mockPolicyManager = await IExtension.mock(deployer);

  await Promise.all([
    mockExternalPositionManager.activateForFund.returns(undefined),
    mockFeeManager.setConfigForFund.returns(undefined),
    mockFeeManager.activateForFund.returns(undefined),
    mockFeeManager.deactivateForFund.returns(undefined),
    mockIntegrationManager.activateForFund.returns(undefined),
    mockPolicyManager.setConfigForFund.returns(undefined),
    mockPolicyManager.activateForFund.returns(undefined),
  ]);

  const comptrollerLib = await ComptrollerLib.deploy(
    deployer,
    deployment.dispatcher,
    randomAddress(), // ProtocolFeeReserve
    mockFundDeployer,
    randomAddress(), // ValueInterpreter
    mockExternalPositionManager,
    mockFeeManager,
    mockIntegrationManager,
    mockPolicyManager,
    deployment.chainlinkPriceFeed,
    randomAddress(), // AssetFinalityResolver
    config.primitives.mln,
  );

  // Deploy configured ComptrollerProxy
  const sharesActionTimelock = 1234;
  const feeManagerConfigData = utils.hexlify(utils.randomBytes(4));
  const policyManagerConfigData = utils.hexlify(utils.randomBytes(8));
  const { comptrollerProxy } = await createComptrollerProxy({
    signer: deployer,
    comptrollerLib,
    denominationAsset,
    sharesActionTimelock,
  });

  // Deploy Mock VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.addTrackedAsset.returns(undefined);
  await mockVaultProxy.balanceOf.returns(0);
  await mockVaultProxy.getOwner.returns(mockVaultProxyOwner);
  await mockVaultProxy.payProtocolFee.returns(undefined);
  await mockVaultProxy.transferShares.returns(undefined);

  return {
    accounts: remainingAccounts,
    deployer,
    comptrollerLib,
    comptrollerProxy: comptrollerProxy.connect(mockVaultProxyOwner),
    feeManagerConfigData,
    mockFeeManager,
    mockFundDeployer,
    mockIntegrationManager,
    mockPolicyManager,
    mockVaultProxy,
    mockVaultProxyOwner,
    policyManagerConfigData,
    sharesActionTimelock,
    supportedAsset: denominationAsset,
  };
}

describe('init', () => {
  it('does not allow an unsupported denomination asset', async () => {
    const { deployer: signer, comptrollerLib } = await provider.snapshot(snapshot);

    await expect(
      createComptrollerProxy({
        signer,
        comptrollerLib,
        denominationAsset: randomAddress(),
      }),
    ).rejects.toBeRevertedWith('Bad denomination asset');
  });

  it('correctly handles valid call', async () => {
    const { comptrollerProxy, sharesActionTimelock, supportedAsset: denominationAsset } = await provider.snapshot(
      snapshot,
    );

    // ComptrollerProxy has already been created (and init() called),
    // so we just need to assert state and expected calls

    // Assert state has been set
    const getDenominationAssetCall = await comptrollerProxy.getDenominationAsset();
    expect(getDenominationAssetCall).toMatchAddress(denominationAsset);

    const getOverridePauseCall = await comptrollerProxy.getOverridePause();
    expect(getOverridePauseCall).toBe(false);

    const getSharesActionTimelockCall = await comptrollerProxy.getSharesActionTimelock();
    expect(getSharesActionTimelockCall).toEqBigNumber(sharesActionTimelock);
  });

  it('can only be called once', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    // ComptrollerProxy has already been created (and init() called)
    await expect(comptrollerProxy.init(randomAddress(), 0)).rejects.toBeRevertedWith('Already initialized');
  });
});

describe('configureExtensions', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    await expect(comptrollerProxy.configureExtensions('0x', '0x')).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });

  it('correctly handles valid call (no extensions)', async () => {
    const { comptrollerProxy, mockFeeManager, mockFundDeployer, mockPolicyManager } = await provider.snapshot(snapshot);

    await mockFundDeployer.forward(comptrollerProxy.configureExtensions, '0x', '0x');

    // No calls should have been made, because no extension configuration data exists
    expect(mockFeeManager.setConfigForFund).not.toHaveBeenCalledOnContract();
    expect(mockPolicyManager.setConfigForFund).not.toHaveBeenCalledOnContract();
  });

  it('correctly handles valid call (two extensions)', async () => {
    const {
      comptrollerProxy,
      feeManagerConfigData,
      mockFeeManager,
      mockFundDeployer,
      mockPolicyManager,
      policyManagerConfigData,
    } = await provider.snapshot(snapshot);

    await mockFundDeployer.forward(comptrollerProxy.configureExtensions, feeManagerConfigData, policyManagerConfigData);

    // Assert expected calls
    expect(mockFeeManager.setConfigForFund).toHaveBeenCalledOnContractWith(feeManagerConfigData);
    expect(mockPolicyManager.setConfigForFund).toHaveBeenCalledOnContractWith(policyManagerConfigData);
  });
});

describe('setVaultProxy', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    await expect(comptrollerProxy.setVaultProxy(randomAddress())).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });

  it('correctly handles valid call', async () => {
    const { comptrollerProxy, mockFundDeployer, mockVaultProxy } = await provider.snapshot(snapshot);

    // Call activate()
    const receipt = await mockFundDeployer.forward(comptrollerProxy.setVaultProxy, mockVaultProxy);

    // Assert events emitted
    const VaultProxySetEvent = comptrollerProxy.abi.getEvent('VaultProxySet');
    assertEvent(receipt, VaultProxySetEvent, {
      vaultProxy: mockVaultProxy,
    });

    // Assert state has been set
    const vaultProxyResult = await comptrollerProxy.getVaultProxy();
    expect(vaultProxyResult).toMatchAddress(mockVaultProxy);
  });
});

describe('activate', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    await expect(comptrollerProxy.activate(false)).rejects.toBeRevertedWith('Only FundDeployer callable');
  });

  it('correctly handles valid call (new fund)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockIntegrationManager,
      mockPolicyManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Set VaultProxy
    await mockFundDeployer.forward(comptrollerProxy.setVaultProxy, mockVaultProxy);

    // Call activate()
    await mockFundDeployer.forward(comptrollerProxy.activate, false);

    // Assert expected calls
    expect(mockVaultProxy.addTrackedAsset).toHaveBeenCalledOnContractWith(
      await comptrollerProxy.getDenominationAsset(),
    );

    expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContractWith(false);
    expect(mockIntegrationManager.activateForFund).toHaveBeenCalledOnContractWith(false);
    expect(mockPolicyManager.activateForFund).toHaveBeenCalledOnContractWith(false);

    // Should not have called the path for activation of migrated funds
    expect(mockVaultProxy.balanceOf).not.toHaveBeenCalledOnContract();
  });

  it('correctly handles valid call (migrated fund)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockIntegrationManager,
      mockPolicyManager,
      mockVaultProxy,
      mockVaultProxyOwner,
    } = await provider.snapshot(snapshot);

    // Set VaultProxy
    await mockFundDeployer.forward(comptrollerProxy.setVaultProxy, mockVaultProxy);

    // Mock shares due balance to assert burn/mint calls during activation
    const sharesDue = 100;
    await mockVaultProxy.balanceOf.given(mockVaultProxy).returns(sharesDue);

    // Call activate()
    const receipt = await mockFundDeployer.forward(comptrollerProxy.activate, true);

    // Assert events emitted
    const MigratedSharesDuePaidEvent = comptrollerProxy.abi.getEvent('MigratedSharesDuePaid');
    assertEvent(receipt, MigratedSharesDuePaidEvent, {
      sharesDue: BigNumber.from(sharesDue),
    });

    // Assert expected calls
    expect(mockVaultProxy.transferShares).toHaveBeenCalledOnContractWith(
      mockVaultProxy,
      mockVaultProxyOwner,
      sharesDue,
    );

    expect(mockVaultProxy.addTrackedAsset).toHaveBeenCalledOnContractWith(
      await comptrollerProxy.getDenominationAsset(),
    );

    expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContractWith(true);
    expect(mockIntegrationManager.activateForFund).toHaveBeenCalledOnContractWith(true);
    expect(mockPolicyManager.activateForFund).toHaveBeenCalledOnContractWith(true);
  });
});

describe('destructActivated', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    await expect(comptrollerProxy.destructActivated()).rejects.toBeRevertedWith('Only FundDeployer callable');
  });

  it('correctly handles valid call', async () => {
    const { comptrollerProxy, mockFeeManager, mockFundDeployer, mockVaultProxy } = await provider.snapshot(snapshot);

    // Set VaultProxy
    await mockFundDeployer.forward(comptrollerProxy.setVaultProxy, mockVaultProxy);

    // Activate fund
    await mockFundDeployer.forward(comptrollerProxy.activate, false);

    // Confirm that a state call resolves prior to destruct
    const preGetDenominationAssetCall = await comptrollerProxy.getDenominationAsset();
    expect(preGetDenominationAssetCall).toBeTruthy();

    // Destruct fund
    await mockFundDeployer.forward(comptrollerProxy.destructActivated);

    // Assert state has been wiped by assuring call now reverts
    await expect(comptrollerProxy.getDenominationAsset()).rejects.toBeReverted();

    // Assert expected calls
    expect(mockFeeManager.deactivateForFund).toHaveBeenCalledOnContract();
    expect(mockVaultProxy.payProtocolFee).toHaveBeenCalledOnContract();
  });
});

describe('destructUnactivated', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    await expect(comptrollerProxy.destructUnactivated()).rejects.toBeRevertedWith('Only FundDeployer callable');
  });

  it('correctly handles valid call', async () => {
    const { comptrollerProxy, mockFundDeployer } = await provider.snapshot(snapshot);

    // Confirm that a state call resolves prior to destruct
    const preGetDenominationAssetCall = await comptrollerProxy.getDenominationAsset();
    expect(preGetDenominationAssetCall).toBeTruthy();

    // Destruct fund
    await mockFundDeployer.forward(comptrollerProxy.destructUnactivated);

    // Assert state has been wiped by assuring call now reverts
    await expect(comptrollerProxy.getDenominationAsset()).rejects.toBeReverted();
  });
});
