import { constants } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { IMigrationHookHandler, MockVaultLib } from '@melonproject/protocol';
import {
  defaultTestDeployment,
  createNewFund,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    config,
    deployment,
  } = await defaultTestDeployment(provider);

  // Get mock fees and mock policies data with which to configure fund
  const feeManagerConfig = await generateFeeManagerConfigWithMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  const policyManagerConfig = await generatePolicyManagerConfigWithMockPolicies({
    deployer: config.deployer,
    policyManager: deployment.policyManager,
  });

  // Create initial fund on prevFundDeployer
  const { comptrollerProxy: prevComptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundDeployer: deployment.fundDeployer,
    fundOwner,
    denominationAsset: deployment.tokens.weth,
    feeManagerConfig,
    policyManagerConfig,
  });

  // Mock a nextFundDeployer contract and nextVaultLib
  const mockNextFundDeployer = await IMigrationHookHandler.mock(config.deployer);
  await mockNextFundDeployer.postCancelMigrationTargetHook.returns(undefined);
  const mockNextVaultLib = await MockVaultLib.deploy(config.deployer);

  // Set the mock FundDeployer on Dispatcher
  await deployment.dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fundOwner,
    mockNextFundDeployer,
    mockNextVaultLib,
    prevComptrollerProxy,
    vaultProxy,
  };
}

describe('preMigrateOriginHook', () => {
  it('can only be called by the Dispatcher', async () => {
    const {
      accounts: [randomUser],
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer
        .connect(randomUser)
        .preMigrateOriginHook(randomAddress(), constants.AddressZero, constants.AddressZero, constants.AddressZero, 0),
    ).rejects.toBeRevertedWith('Only Dispatcher can call this function');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: { dispatcher, fundDeployer },
      mockNextFundDeployer,
      mockNextVaultLib,
      prevComptrollerProxy,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    // Signal migration via mockNextFundDeployer
    await mockNextFundDeployer.forward(
      dispatcher.signalMigration,
      vaultProxy,
      randomAddress(),
      mockNextVaultLib,
      false,
    );

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Execute migrate from nextFundDeployer
    await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

    // Assert expected calls
    expect(fundDeployer.preMigrateOriginHook).toHaveBeenCalledOnContract();
    expect(prevComptrollerProxy.destruct).toHaveBeenCalledOnContract();
  });
});
