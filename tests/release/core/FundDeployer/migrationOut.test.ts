import { randomAddress } from '@enzymefinance/ethers';
import { IMigrationHookHandler, MigrationOutHook, MockVaultLib, StandardToken } from '@enzymefinance/protocol';
import {
  createNewFund,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [fundOwner, arbitraryUser],
    config: { weth },
    deployment: { dispatcher, fundDeployer, feeManager, policyManager },
  } = await deployProtocolFixture();

  const denominationAsset = new StandardToken(weth, deployer);

  // Get mock fees and mock policies data with which to configure fund
  const feeManagerConfig = await generateFeeManagerConfigWithMockFees({
    deployer,
    feeManager,
  });

  const policyManagerConfig = await generatePolicyManagerConfigWithMockPolicies({
    deployer,
    policyManager,
  });

  // Create initial fund on prevFundDeployer
  const { comptrollerProxy: prevComptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundDeployer,
    fundOwner,
    denominationAsset,
    feeManagerConfig,
    policyManagerConfig,
  });

  // Mock a nextFundDeployer contract and nextVaultLib
  const mockNextFundDeployer = await IMigrationHookHandler.mock(deployer);
  await mockNextFundDeployer.invokeMigrationInCancelHook.returns(undefined);
  const mockNextVaultLib = await MockVaultLib.deploy(deployer);

  // Set the mock FundDeployer on Dispatcher
  await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

  return {
    deployer,
    arbitraryUser,
    fundOwner,
    dispatcher,
    fundDeployer,
    mockNextFundDeployer,
    mockNextVaultLib,
    prevComptrollerProxy,
    vaultProxy,
  };
}

describe('implementMigrationOutHook', () => {
  describe('PreMigrate', () => {
    it('can only be called by the Dispatcher', async () => {
      const { arbitraryUser, fundDeployer } = await provider.snapshot(snapshot);

      await expect(
        fundDeployer
          .connect(arbitraryUser)
          .invokeMigrationOutHook(
            MigrationOutHook.PreMigrate,
            randomAddress(),
            constants.AddressZero,
            constants.AddressZero,
            constants.AddressZero,
          ),
      ).rejects.toBeRevertedWith('Only Dispatcher can call this function');
    });

    it('correctly handles the PreMigrate hook', async () => {
      const {
        deployer,
        dispatcher,
        fundDeployer,
        mockNextFundDeployer,
        mockNextVaultLib,
        prevComptrollerProxy,
        vaultProxy,
      } = await provider.snapshot(snapshot);

      // The accessor can be any contract
      const mockNextAccessor = await IMigrationHookHandler.mock(deployer);

      // Signal migration via mockNextFundDeployer
      await mockNextFundDeployer.forward(
        dispatcher.signalMigration,
        vaultProxy,
        mockNextAccessor,
        mockNextVaultLib,
        false,
      );

      // Warp to migratable time
      const migrationTimelock = await dispatcher.getMigrationTimelock();
      await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

      // Execute migrate from nextFundDeployer
      await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

      // Assert expected calls
      expect(fundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
        MigrationOutHook.PreMigrate,
        vaultProxy,
        mockNextFundDeployer,
        mockNextAccessor,
        mockNextVaultLib,
      );
      expect(prevComptrollerProxy.destruct).toHaveBeenCalledOnContract();
    });
  });
});
