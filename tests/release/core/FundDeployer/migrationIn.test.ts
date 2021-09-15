import { extractEvent } from '@enzymefinance/ethers';
import {
  IMigrationHookHandler,
  MigrationOutHook,
  MockVaultLib,
  ReleaseStatusTypes,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  createMigratedFundConfig,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    deployer,
    config,
    accounts: [fundOwner, arbitraryUser, arbitraryComptrollerProxyCreator],
    deployment: { dispatcher, vaultLib, fundDeployer, feeManager, policyManager },
  } = await deployProtocolFixture();

  const denominationAsset = new StandardToken(config.weth, deployer);

  // Mock a FundDeployer contract for the prev fund
  const mockPrevFundDeployer = await IMigrationHookHandler.mock(deployer);
  await mockPrevFundDeployer.invokeMigrationOutHook.returns(undefined);

  // Set the mock FundDeployer on Dispatcher
  await dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

  // Deploy a migratable VaultProxy using a mock VaultLib
  const mockPrevVaultAccessor = await IMigrationHookHandler.mock(deployer);
  const mockPrevVaultLib = await MockVaultLib.deploy(deployer);
  const receipt = await mockPrevFundDeployer.forward(
    dispatcher.deployVaultProxy,
    mockPrevVaultLib,
    fundOwner,
    mockPrevVaultAccessor,
    '',
  );

  const eventFragment = dispatcher.abi.getEvent('VaultProxyDeployed');
  const vaultProxyDeployedEvent = extractEvent(receipt, eventFragment)[0];
  const vaultProxyAddress = vaultProxyDeployedEvent.args.vaultProxy;

  // Set real fund deployer on Dispatcher
  await dispatcher.setCurrentFundDeployer(fundDeployer);

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer,
    feeManager,
  });

  const policyManagerConfigData = await generatePolicyManagerConfigWithMockPolicies({
    deployer,
    policyManager,
  });

  // Create fund config on the FundDeployer
  const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
    signer: fundOwner,
    fundDeployer,
    denominationAsset,
    feeManagerConfigData,
    policyManagerConfigData,
  });

  return {
    arbitraryUser,
    arbitraryComptrollerProxyCreator,
    nextComptrollerProxy,
    fundOwner,
    denominationAsset,
    fundDeployer,
    vaultLib,
    dispatcher,
    mockPrevFundDeployer,
    vaultProxyAddress,
  };
}

describe('signalMigration', () => {
  it('can only be called by the comptrollerProxy creator', async () => {
    const { arbitraryUser, fundDeployer, denominationAsset, fundOwner, vaultProxyAddress } = await provider.snapshot(
      snapshot,
    );

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await expect(
      fundDeployer.connect(arbitraryUser).signalMigration(vaultProxyAddress, comptrollerProxy),
    ).rejects.toBeRevertedWith('Only the ComptrollerProxy creator can call this function');
  });

  it('can only be called by a permissioned migrator of the vault', async () => {
    const { arbitraryComptrollerProxyCreator, fundDeployer, denominationAsset, vaultProxyAddress } =
      await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: arbitraryComptrollerProxyCreator,
      fundDeployer,
      denominationAsset,
    });

    await expect(
      fundDeployer.connect(arbitraryComptrollerProxyCreator).signalMigration(vaultProxyAddress, comptrollerProxy),
    ).rejects.toBeRevertedWith('Only a permissioned migrator can call this function');
  });

  it('does not allow the release to be paused', async () => {
    const { fundDeployer, fundOwner, nextComptrollerProxy, vaultProxyAddress } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy),
    ).rejects.toBeRevertedWith('Release is not Live');
  });

  it('correctly handles valid call', async () => {
    const { dispatcher, fundDeployer, vaultLib, fundOwner, nextComptrollerProxy, vaultProxyAddress } =
      await provider.snapshot(snapshot);

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
    const { arbitraryUser, dispatcher, fundDeployer, denominationAsset, fundOwner, vaultProxyAddress } =
      await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, comptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await expect(fundDeployer.connect(arbitraryUser).executeMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('does not allow the release to be paused', async () => {
    const { fundDeployer, fundOwner, nextComptrollerProxy, vaultProxyAddress } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);
    await expect(fundDeployer.connect(fundOwner).executeMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Release is not Live',
    );
  });

  it('correctly handles valid call', async () => {
    const { dispatcher, fundDeployer, fundOwner, nextComptrollerProxy, vaultProxyAddress } = await provider.snapshot(
      snapshot,
    );

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
    const { arbitraryUser, fundDeployer, denominationAsset, fundOwner, vaultProxyAddress } = await provider.snapshot(
      snapshot,
    );

    const { comptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(fundDeployer.connect(arbitraryUser).cancelMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('does not allow the release to be paused', async () => {
    const { fundDeployer, fundOwner, nextComptrollerProxy, vaultProxyAddress } = await provider.snapshot(snapshot);

    await fundDeployer.connect(fundOwner).signalMigration(vaultProxyAddress, nextComptrollerProxy);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);
    await expect(fundDeployer.connect(fundOwner).cancelMigration(vaultProxyAddress)).rejects.toBeRevertedWith(
      'Release is not Live',
    );
  });

  it('correctly handles valid call', async () => {
    const { dispatcher, fundDeployer, fundOwner, nextComptrollerProxy, vaultProxyAddress } = await provider.snapshot(
      snapshot,
    );

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
        dispatcher,
        fundDeployer,
        vaultLib,
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
        dispatcher,
        fundDeployer,
        vaultLib,
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
        dispatcher,
        fundDeployer,
        vaultLib,
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
