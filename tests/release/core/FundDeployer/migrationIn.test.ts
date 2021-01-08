import { constants } from 'ethers';
import { extractEvent, EthereumTestnetProvider } from '@crestproject/crestproject';
import { IMigrationHookHandler, MigrationOutHook, MockVaultLib, ReleaseStatusTypes } from '@melonproject/protocol';
import {
  defaultTestDeployment,
  createMigratedFundConfig,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    config,
    deployment,
  } = await defaultTestDeployment(provider);

  // Mock a FundDeployer contract for the prev fund
  const mockPrevFundDeployer = await IMigrationHookHandler.mock(config.deployer);
  await mockPrevFundDeployer.invokeMigrationOutHook.returns(undefined);

  // Set the mock FundDeployer on Dispatcher
  await deployment.dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

  // Deploy a migratable VaultProxy using a mock VaultLib
  const mockPrevVaultAccessor = await IMigrationHookHandler.mock(config.deployer);
  const mockPrevVaultLib = await MockVaultLib.deploy(config.deployer);
  const receipt = await mockPrevFundDeployer.forward(
    deployment.dispatcher.deployVaultProxy,
    mockPrevVaultLib,
    fundOwner,
    mockPrevVaultAccessor,
    '',
  );

  const eventFragment = deployment.dispatcher.abi.getEvent('VaultProxyDeployed');
  const vaultProxyDeployedEvent = extractEvent(receipt, eventFragment)[0];
  const vaultProxyAddress = vaultProxyDeployedEvent.args.vaultProxy;

  // Set real fund deployer on Dispatcher
  await deployment.dispatcher.setCurrentFundDeployer(deployment.fundDeployer);

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  const policyManagerConfigData = await generatePolicyManagerConfigWithMockPolicies({
    deployer: config.deployer,
    policyManager: deployment.policyManager,
  });

  // Create fund config on the FundDeployer
  const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
    signer: fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
    feeManagerConfigData,
    policyManagerConfigData,
  });

  return {
    accounts: remainingAccounts,
    nextComptrollerProxy,
    config,
    deployment,
    fundOwner,
    mockPrevFundDeployer,
    vaultProxyAddress,
  };
}

describe('signalMigration', () => {
  it('can only be called by the comptrollerProxy creator', async () => {
    const {
      accounts: [randomUser],
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      fundOwner,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await expect(
      fundDeployer.connect(randomUser).signalMigration(vaultProxyAddress, comptrollerProxy),
    ).rejects.toBeRevertedWith('Only the ComptrollerProxy creator can call this function');
  });

  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: [randomComptrollerProxyCreator],
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: randomComptrollerProxyCreator,
      fundDeployer,
      denominationAsset,
    });

    await expect(
      fundDeployer.connect(randomComptrollerProxyCreator).signalMigration(vaultProxyAddress, comptrollerProxy),
    ).rejects.toBeRevertedWith('Only a permissioned migrator can call this function');
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: { fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer, vaultLib },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Assert expected calls
    expect(dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
      vaultProxyAddress,
      nextComptrollerProxy,
      vaultLib,
      false,
    );
  });
});

describe('executeMigration', () => {
  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: [randomUser],
      deployment: {
        dispatcher,
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      fundOwner,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, comptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await expect(fundDeployer.connect(randomUser).executeMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: { fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);
    await expect(fundDeployer.connect(fundOwner).executeMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Release is not Live',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await fundDeployer.connect(fundOwner).executeMigration(vaultProxyAddress);

    // Assert expected state changes
    const getPendingComptrollerProxyCreatorCall = await fundDeployer.getPendingComptrollerProxyCreator(
      nextComptrollerProxy,
    );
    expect(getPendingComptrollerProxyCreatorCall).toMatchAddress(constants.AddressZero);

    // Assert expected calls
    expect(dispatcher.executeMigration).toHaveBeenCalledOnContractWith(vaultProxyAddress, false);
    expect(nextComptrollerProxy.activate).toHaveBeenCalledOnContractWith(vaultProxyAddress, true);
  });
});

describe('cancelMigration', () => {
  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: [randomUser],
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      fundOwner,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(fundDeployer.connect(randomUser).cancelMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: { fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);
    await expect(fundDeployer.connect(fundOwner).cancelMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Release is not Live',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);
    await fundDeployer.connect(fundOwner).cancelMigration(vaultProxyAddress);

    // Assert expected calls
    expect(dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(vaultProxyAddress, false);
  });
});

describe('emergency functions', () => {
  describe('signalMigrationEmergency', () => {
    it('correctly handles valid call', async () => {
      const {
        deployment: { dispatcher, fundDeployer, vaultLib },
        fundOwner,
        mockPrevFundDeployer,
        nextComptrollerProxy,
        vaultProxyAddress,
      } = await provider.snapshot(snapshot);

      // Set a signalMigration hook to revert on prevFundDeployer
      const revertReason = 'because testing';
      await mockPrevFundDeployer.invokeMigrationOutHook
        .given(MigrationOutHook.PreSignal, vaultProxyAddress, fundDeployer, nextComptrollerProxy, vaultLib)
        .reverts(revertReason);

      await expect(
        fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy),
      ).rejects.toBeRevertedWith(revertReason);

      // Bypassing failing hooks should allow the call to succeed
      await expect(
        fundDeployer.connect(fundOwner).signalMigrationEmergency(vaultProxyAddress, nextComptrollerProxy),
      ).resolves.toBeReceipt();

      // Assert expected calls
      expect(dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
        vaultProxyAddress,
        nextComptrollerProxy,
        vaultLib,
        true,
      );
    });
  });

  describe('executeMigrationEmergency', () => {
    it('correctly handles valid call', async () => {
      const {
        deployment: { dispatcher, fundDeployer, vaultLib },
        fundOwner,
        mockPrevFundDeployer,
        nextComptrollerProxy,
        vaultProxyAddress,
      } = await provider.snapshot(snapshot);

      await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

      // Warp to migratable time
      const migrationTimelock = await dispatcher.getMigrationTimelock();
      await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

      // Set an executeMigration hook to revert on prevFundDeployer
      const revertReason = 'because testing';
      await mockPrevFundDeployer.invokeMigrationOutHook
        .given(MigrationOutHook.PreMigrate, vaultProxyAddress, fundDeployer, nextComptrollerProxy, vaultLib)
        .reverts(revertReason);

      await expect(fundDeployer.connect(fundOwner).executeMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
        revertReason,
      );

      // Bypassing failing hooks should allow the call to succeed
      await expect(fundDeployer.connect(fundOwner).executeMigrationEmergency(vaultProxyAddress)).resolves.toBeReceipt();

      // Assert expected calls
      expect(dispatcher.executeMigration).toHaveBeenCalledOnContractWith(vaultProxyAddress, true);
      expect(nextComptrollerProxy.activate).toHaveBeenCalledOnContractWith(vaultProxyAddress, true);
    });
  });

  describe('cancelMigrationEmergency', () => {
    it('correctly handles valid call', async () => {
      const {
        deployment: { dispatcher, fundDeployer, vaultLib },
        fundOwner,
        mockPrevFundDeployer,
        nextComptrollerProxy,
        vaultProxyAddress,
      } = await provider.snapshot(snapshot);

      await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

      // Set a cancelMigration hook to revert on prevFundDeployer
      const revertReason = 'because testing';
      await mockPrevFundDeployer.invokeMigrationOutHook
        .given(MigrationOutHook.PostCancel, vaultProxyAddress, fundDeployer, nextComptrollerProxy, vaultLib)
        .reverts(revertReason);

      await expect(fundDeployer.connect(fundOwner).cancelMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
        revertReason,
      );

      // Bypassing failing hooks should allow the call to succeed
      await expect(fundDeployer.connect(fundOwner).cancelMigrationEmergency(vaultProxyAddress)).resolves.toBeReceipt();

      // Assert expected calls
      expect(dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(vaultProxyAddress, true);
    });
  });
});
