import {
  extractEvent,
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  IMigrationHookHandler,
  MockVaultLib,
} from '@melonproject/persistent/utils/contracts';
import { constants } from 'ethers';
import { defaultTestDeployment } from '../../../dist';
import {
  createMigratedFundConfig,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockFees,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await defaultTestDeployment(
    provider,
  );

  // Mock a FundDeployer contract for the prev fund
  const mockPrevFundDeployer = await IMigrationHookHandler.mock(
    config.deployer,
  );
  await mockPrevFundDeployer.postCancelMigrationOriginHook.returns(undefined);
  await mockPrevFundDeployer.preMigrateOriginHook.returns(undefined);
  await mockPrevFundDeployer.postMigrateOriginHook.returns(undefined);
  await mockPrevFundDeployer.preSignalMigrationOriginHook.returns(undefined);
  await mockPrevFundDeployer.postSignalMigrationOriginHook.returns(undefined);

  // Set the mock FundDeployer on Dispatcher
  await deployment.dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

  // Deploy a migratable VaultProxy using a mock VaultLib
  const mockPrevVaultLib = await MockVaultLib.deploy(config.deployer);
  const [fundOwner, ...remainingAccounts] = accounts;
  const receipt = await mockPrevFundDeployer.forward(
    deployment.dispatcher.deployVaultProxy,
    mockPrevVaultLib,
    fundOwner,
    randomAddress(),
    '',
  );
  const vaultProxyDeployedEvent = extractEvent(
    receipt,
    deployment.dispatcher.abi.getEvent('VaultProxyDeployed'),
  )[0];
  const vaultProxyAddress = vaultProxyDeployedEvent.args.vaultProxy;

  // Set real fund deployer on Dispatcher
  await deployment.dispatcher.setCurrentFundDeployer(deployment.fundDeployer);

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });
  const policyManagerConfigData = await generatePolicyManagerConfigWithMockFees(
    {
      deployer: config.deployer,
      policyManager: deployment.policyManager,
    },
  );

  // Create fund config on the FundDeployer
  const {
    comptrollerProxy: nextComptrollerProxy,
  } = await createMigratedFundConfig({
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
      accounts: { 0: randomUser },
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

    const signalMigrationTx = fundDeployer
      .connect(randomUser)
      .signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(signalMigrationTx).rejects.toBeRevertedWith(
      'Only the ComptrollerProxy creator can call this function',
    );
  });

  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: { 0: randomComptrollerProxyCreator },
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

    const signalMigrationTx = fundDeployer
      .connect(randomComptrollerProxyCreator)
      .signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(signalMigrationTx).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer, vaultLib },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const signalMigrationTx = fundDeployer
      .connect(fundOwner)
      .signalMigration(vaultProxyAddress, nextComptrollerProxy);
    await expect(signalMigrationTx).resolves.toBeReceipt();

    // Assert expected calls
    await expect(dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
      vaultProxyAddress,
      nextComptrollerProxy.address,
      vaultLib.address,
      false,
    );
  });
});

describe('executeMigration', () => {
  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: { 0: randomUser },
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

    const signalMigrationTx = fundDeployer
      .connect(fundOwner)
      .signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(signalMigrationTx).resolves.toBeReceipt();

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    const executeMigrationTx = fundDeployer
      .connect(randomUser)
      .executeMigration(vaultProxyAddress);
    await expect(executeMigrationTx).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const signalMigrationTx = fundDeployer
      .connect(fundOwner)
      .signalMigration(vaultProxyAddress, nextComptrollerProxy);
    await expect(signalMigrationTx).resolves.toBeReceipt();

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    const executeMigrationTx = fundDeployer
      .connect(fundOwner)
      .executeMigration(vaultProxyAddress);
    await expect(executeMigrationTx).resolves.toBeReceipt();

    // Assert expected state changes
    const getPendingComptrollerProxyCreatorCall = fundDeployer.getPendingComptrollerProxyCreator(
      nextComptrollerProxy,
    );
    await expect(getPendingComptrollerProxyCreatorCall).resolves.toBe(
      constants.AddressZero,
    );

    // Assert expected calls
    await expect(dispatcher.executeMigration).toHaveBeenCalledOnContractWith(
      vaultProxyAddress,
      false,
    );
    await expect(nextComptrollerProxy.activate).toHaveBeenCalledOnContractWith(
      vaultProxyAddress,
      true,
    );
  });
});

describe('cancelMigration', () => {
  it('can only be called by a permissioned migrator of the vault', async () => {
    const {
      accounts: { 0: randomUser },
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

    const signalMigrationTx = fundDeployer
      .connect(fundOwner)
      .signalMigration(vaultProxyAddress, comptrollerProxy);
    await expect(signalMigrationTx).resolves.toBeReceipt();

    const cancelMigrationTx = fundDeployer
      .connect(randomUser)
      .cancelMigration(vaultProxyAddress);
    await expect(cancelMigrationTx).rejects.toBeRevertedWith(
      'Only a permissioned migrator can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer },
      fundOwner,
      nextComptrollerProxy,
      vaultProxyAddress,
    } = await provider.snapshot(snapshot);

    const signalMigrationTx = fundDeployer
      .connect(fundOwner)
      .signalMigration(vaultProxyAddress, nextComptrollerProxy);
    await expect(signalMigrationTx).resolves.toBeReceipt();

    const cancelMigrationTx = fundDeployer
      .connect(fundOwner)
      .cancelMigration(vaultProxyAddress);
    await expect(cancelMigrationTx).resolves.toBeReceipt();

    // Assert expected calls
    await expect(dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(
      vaultProxyAddress,
      false,
    );
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
      await mockPrevFundDeployer.preSignalMigrationOriginHook.reverts(
        revertReason,
      );
      const badSignalMigrationTx = fundDeployer
        .connect(fundOwner)
        .signalMigration(vaultProxyAddress, nextComptrollerProxy);
      await expect(badSignalMigrationTx).rejects.toBeRevertedWith(revertReason);

      // Bypassing failing hooks should allow the call to succeed
      const goodSignalMigrationTx = fundDeployer
        .connect(fundOwner)
        .signalMigrationEmergency(vaultProxyAddress, nextComptrollerProxy);
      await expect(goodSignalMigrationTx).resolves.toBeReceipt();

      // Assert expected calls
      await expect(dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
        vaultProxyAddress,
        nextComptrollerProxy.address,
        vaultLib.address,
        true,
      );
    });
  });

  describe('executeMigrationEmergency', () => {
    it('correctly handles valid call', async () => {
      const {
        deployment: { dispatcher, fundDeployer },
        fundOwner,
        mockPrevFundDeployer,
        nextComptrollerProxy,
        vaultProxyAddress,
      } = await provider.snapshot(snapshot);

      const signalMigrationTx = fundDeployer
        .connect(fundOwner)
        .signalMigration(vaultProxyAddress, nextComptrollerProxy);
      await expect(signalMigrationTx).resolves.toBeReceipt();

      // Warp to migratable time
      const migrationTimelock = await dispatcher.getMigrationTimelock();
      await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

      // Set an executeMigration hook to revert on prevFundDeployer
      const revertReason = 'because testing';
      await mockPrevFundDeployer.preMigrateOriginHook.reverts(revertReason);
      const badExecuteMigrationTx = fundDeployer
        .connect(fundOwner)
        .executeMigration(vaultProxyAddress);
      await expect(badExecuteMigrationTx).rejects.toBeRevertedWith(
        revertReason,
      );

      // Bypassing failing hooks should allow the call to succeed
      const goodExecuteMigrationTx = fundDeployer
        .connect(fundOwner)
        .executeMigrationEmergency(vaultProxyAddress);
      await expect(goodExecuteMigrationTx).resolves.toBeReceipt();

      // Assert expected calls
      await expect(dispatcher.executeMigration).toHaveBeenCalledOnContractWith(
        vaultProxyAddress,
        true,
      );
      await expect(
        nextComptrollerProxy.activate,
      ).toHaveBeenCalledOnContractWith(vaultProxyAddress, true);
    });
  });

  describe('cancelMigrationEmergency', () => {
    it('correctly handles valid call', async () => {
      const {
        deployment: { dispatcher, fundDeployer },
        fundOwner,
        mockPrevFundDeployer,
        nextComptrollerProxy,
        vaultProxyAddress,
      } = await provider.snapshot(snapshot);

      const signalMigrationTx = fundDeployer
        .connect(fundOwner)
        .signalMigration(vaultProxyAddress, nextComptrollerProxy);
      await expect(signalMigrationTx).resolves.toBeReceipt();

      // Set a cancelMigration hook to revert on prevFundDeployer
      const revertReason = 'because testing';
      await mockPrevFundDeployer.postCancelMigrationOriginHook.reverts(
        revertReason,
      );
      const badCancelMigrationTx = fundDeployer
        .connect(fundOwner)
        .cancelMigration(vaultProxyAddress);
      await expect(badCancelMigrationTx).rejects.toBeRevertedWith(revertReason);

      // Bypassing failing hooks should allow the call to succeed
      const goodCancelMigrationTx = fundDeployer
        .connect(fundOwner)
        .cancelMigrationEmergency(vaultProxyAddress);
      await expect(goodCancelMigrationTx).resolves.toBeReceipt();

      // Assert expected calls
      await expect(dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(
        vaultProxyAddress,
        true,
      );
    });
  });
});
