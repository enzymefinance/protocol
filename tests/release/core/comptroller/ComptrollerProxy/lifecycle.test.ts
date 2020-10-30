import { BigNumber, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  assertEvent,
  defaultTestDeployment,
  createComptrollerProxy,
  releaseStatusTypes,
} from '@melonproject/testutils';
import {
  IExtension,
  ComptrollerLib,
  FundDeployer,
  FundLifecycleLib,
  VaultLib,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await defaultTestDeployment(
    provider,
  );

  // Deploy a mock FundDeployer
  const mockFundDeployer = await FundDeployer.mock(config.deployer);
  await mockFundDeployer.getReleaseStatus.returns(releaseStatusTypes.Live);

  // Deploy mock extensions
  const mockFeeManager = await IExtension.mock(config.deployer);
  const mockIntegrationManager = await IExtension.mock(config.deployer);
  const mockPolicyManager = await IExtension.mock(config.deployer);

  await Promise.all([
    mockFeeManager.setConfigForFund.returns(undefined),
    mockFeeManager.activateForFund.returns(undefined),
    mockFeeManager.deactivateForFund.returns(undefined),
    mockIntegrationManager.activateForFund.returns(undefined),
    mockIntegrationManager.deactivateForFund.returns(undefined),
    mockPolicyManager.setConfigForFund.returns(undefined),
    mockPolicyManager.activateForFund.returns(undefined),
    mockPolicyManager.deactivateForFund.returns(undefined),
  ]);

  // Re-deploy a ComptrollerLib that uses the mocks
  const fundLifecycleLib = await FundLifecycleLib.deploy(
    config.deployer,
    mockFundDeployer,
    deployment.chainlinkPriceFeed,
    mockFeeManager,
    mockIntegrationManager,
    mockPolicyManager,
  );
  const comptrollerLib = await ComptrollerLib.deploy(
    config.deployer,
    mockFundDeployer,
    randomAddress(), // ValueInterpreter
    mockFeeManager,
    mockIntegrationManager,
    mockPolicyManager,
    fundLifecycleLib, // FundLifecycleLib
    randomAddress(), // PermissionedVaultActionLib
    randomAddress(), // Engine
  );

  // Deploy configured ComptrollerProxy
  const sharesActionTimelock = 1234;
  const feeManagerConfigData = utils.hexlify(utils.randomBytes(4));
  const policyManagerConfigData = utils.hexlify(utils.randomBytes(8));
  const { comptrollerProxy } = await createComptrollerProxy({
    signer: config.deployer,
    comptrollerLib,
    denominationAsset: deployment.tokens.weth.address,
    sharesActionTimelock,
  });

  // Deploy Mock VaultProxy
  const [mockVaultProxyOwner, ...remainingAccounts] = accounts;
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.balanceOf.returns(0);
  await mockVaultProxy.getOwner.returns(mockVaultProxyOwner);
  await mockVaultProxy.transferShares.returns(undefined);

  return {
    accounts: remainingAccounts,
    config,
    comptrollerLib,
    comptrollerProxy: comptrollerProxy.connect(mockVaultProxyOwner),
    feeManagerConfigData,
    fundLifecycleLib,
    mockFeeManager,
    mockFundDeployer,
    mockIntegrationManager,
    mockPolicyManager,
    mockVaultProxy,
    mockVaultProxyOwner,
    policyManagerConfigData,
    sharesActionTimelock,
    supportedAsset: deployment.tokens.weth,
  };
}

describe('init', () => {
  it('does not allow an unsupported denomination asset', async () => {
    const {
      config: { deployer: signer },
      comptrollerLib,
    } = await provider.snapshot(snapshot);

    const initTx = createComptrollerProxy({
      signer,
      comptrollerLib,
      denominationAsset: randomAddress(),
    });
    await expect(initTx).rejects.toBeRevertedWith('Bad denomination asset');
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      sharesActionTimelock,
      supportedAsset: denominationAsset,
    } = await provider.snapshot(snapshot);

    // ComptrollerProxy has already been created (and init() called),
    // so we just need to assert state and expected calls

    // Assert state has been set
    const getDenominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(getDenominationAssetCall).resolves.toBe(
      denominationAsset.address,
    );

    const getOverridePauseCall = comptrollerProxy.getOverridePause();
    await expect(getOverridePauseCall).resolves.toBe(false);

    const getSharesActionTimelockCall = comptrollerProxy.getSharesActionTimelock();
    await expect(getSharesActionTimelockCall).resolves.toEqBigNumber(
      sharesActionTimelock,
    );
  });

  it('can only be called once', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    // ComptrollerProxy has already been created (and init() called)

    const initTx = comptrollerProxy.init(randomAddress(), 0, []);
    await expect(initTx).rejects.toBeRevertedWith('Already initialized');
  });
});

describe('configureExtensions', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    const configureExtensionsTx = comptrollerProxy.configureExtensions(
      '0x',
      '0x',
    );
    await expect(configureExtensionsTx).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });

  it('correctly handles valid call (no extensions)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockPolicyManager,
    } = await provider.snapshot(snapshot);

    const configureExtensionsTx = mockFundDeployer.forward(
      comptrollerProxy.configureExtensions,
      '0x',
      '0x',
    );
    await expect(configureExtensionsTx).resolves.toBeReceipt();

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

    const configureExtensionsTx = mockFundDeployer.forward(
      comptrollerProxy.configureExtensions,
      feeManagerConfigData,
      policyManagerConfigData,
    );
    await expect(configureExtensionsTx).resolves.toBeReceipt();

    // Assert expected calls
    await expect(
      mockFeeManager.setConfigForFund,
    ).toHaveBeenCalledOnContractWith(feeManagerConfigData);
    await expect(
      mockPolicyManager.setConfigForFund,
    ).toHaveBeenCalledOnContractWith(policyManagerConfigData);
  });
});

describe('activate', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    const activateTx = comptrollerProxy.activate(randomAddress(), false);
    await expect(activateTx).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });

  it('correctly handles valid call (new fund)', async () => {
    const {
      comptrollerProxy,
      fundLifecycleLib,
      mockFeeManager,
      mockFundDeployer,
      mockIntegrationManager,
      mockPolicyManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Call activate()
    const activateTx = mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );
    await expect(activateTx).resolves.toBeReceipt();

    // Assert state has been set
    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(mockVaultProxy.address);

    // Assert expected calls
    await expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContractWith(
      false,
    );
    await expect(
      mockIntegrationManager.activateForFund,
    ).toHaveBeenCalledOnContractWith(false);
    await expect(
      mockPolicyManager.activateForFund,
    ).toHaveBeenCalledOnContractWith(false);

    // Should not have called the path for activation of migrated funds
    expect(mockVaultProxy.balanceOf).not.toHaveBeenCalledOnContract();

    // Assert events emitted
    const VaultProxySetEvent = fundLifecycleLib.abi.getEvent('VaultProxySet');
    await assertEvent(activateTx, VaultProxySetEvent, {
      vaultProxy: mockVaultProxy.address,
    });
  });

  it('correctly handles valid call (migrated fund)', async () => {
    const {
      comptrollerProxy,
      fundLifecycleLib,
      mockFeeManager,
      mockFundDeployer,
      mockIntegrationManager,
      mockPolicyManager,
      mockVaultProxy,
      mockVaultProxyOwner,
    } = await provider.snapshot(snapshot);

    // Mock shares due balance to assert burn/mint calls during activation
    const sharesDue = 100;
    await mockVaultProxy.balanceOf
      .given(mockVaultProxy.address)
      .returns(sharesDue);

    // Call activate()
    const activateTx = mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      true,
    );
    await expect(activateTx).resolves.toBeReceipt();

    // Assert state has been set
    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(mockVaultProxy.address);

    // Assert expected calls
    await expect(mockVaultProxy.transferShares).toHaveBeenCalledOnContractWith(
      mockVaultProxy.address,
      await resolveAddress(mockVaultProxyOwner),
      sharesDue,
    );
    await expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContractWith(
      true,
    );
    await expect(
      mockIntegrationManager.activateForFund,
    ).toHaveBeenCalledOnContractWith(true);
    await expect(
      mockPolicyManager.activateForFund,
    ).toHaveBeenCalledOnContractWith(true);

    // Assert events emitted
    const VaultProxySetEvent = fundLifecycleLib.abi.getEvent('VaultProxySet');
    await assertEvent(activateTx, VaultProxySetEvent, {
      vaultProxy: mockVaultProxy.address,
    });
    const MigratedSharesDuePaidEvent = fundLifecycleLib.abi.getEvent(
      'MigratedSharesDuePaid',
    );
    await assertEvent(activateTx, MigratedSharesDuePaidEvent, {
      sharesDue: BigNumber.from(sharesDue),
    });
  });
});

describe('destruct', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    const destructTx = comptrollerProxy.destruct();
    await expect(destructTx).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      comptrollerProxy,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Mock ReleaseStatus.Pause
    await mockFundDeployer.getReleaseStatus.returns(releaseStatusTypes.Paused);

    // The call should fail
    const badDestructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(badDestructTx).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    // The call should then succeed
    const goodDestructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(goodDestructTx).resolves.toBeReceipt();
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockIntegrationManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Confirm that a state call resolves prior to destruct
    const preGetDenominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(preGetDenominationAssetCall).resolves.toBeTruthy();

    // Destruct fund
    const destructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(destructTx).resolves.toBeReceipt();

    // Assert state has been wiped by assuring call now reverts
    const postGetDenominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(postGetDenominationAssetCall).rejects.toBeReverted();

    // Assert expected calls
    expect(mockFeeManager.deactivateForFund).toHaveBeenCalledOnContract();
    expect(
      mockIntegrationManager.deactivateForFund,
    ).toHaveBeenCalledOnContract();
  });
});
