import type { ContractReceipt } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, FundDeployer, VaultLib } from '@enzymefinance/protocol';
import { ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  createFundDeployer,
  createMigrationRequest,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let fork: ProtocolDeployment;

async function createNewFundOnPrevRelease({
  fork,
  fundOwner,
}: {
  fork: ProtocolDeployment;
  fundOwner: SignerWithAddress;
}) {
  // Create old release, set as live and current fund deployer
  const prevFundDeployer = await createFundDeployer({
    deployer: fork.deployer,
    dispatcher: fork.deployment.dispatcher,
    externalPositionManager: fork.deployment.externalPositionManager,
    feeManager: fork.deployment.feeManager,
    gasRelayPaymasterFactory: fork.deployment.gasRelayPaymasterFactory,
    integrationManager: fork.deployment.integrationManager,
    policyManager: fork.deployment.policyManager,
    setOnDispatcher: true,
    setReleaseLive: true,
    valueInterpreter: fork.deployment.valueInterpreter,
    vaultLib: fork.deployment.vaultLib,
  });

  // Create fund on old release
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: prevFundDeployer,
    fundName: 'My Fund',
    fundOwner,
    signer: fundOwner,
  });

  // Switch dispatcher back to the canonical fund deployer
  await fork.deployment.dispatcher.setCurrentFundDeployer(fork.deployment.fundDeployer);

  return { comptrollerProxy, vaultProxy };
}

describe('createMigrationRequest', () => {
  describe('unhappy paths', () => {
    let fundDeployer: FundDeployer;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;
    });

    // Other validations covered by common logic in createNewFund() tests

    it('cannot be called by a random user', async () => {
      const [fundOwner, randomUser] = fork.accounts;

      const { vaultProxy } = await createNewFundOnPrevRelease({ fork, fundOwner });

      await expect(
        createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: randomUser,
          vaultProxy,
        }),
      ).rejects.toBeRevertedWith('Only a permissioned migrator can call this function');
    });

    it('does not allow ownership handoff to not be incomplete', async () => {
      const {
        externalPositionManager,
        dispatcher,
        feeManager,
        integrationManager,
        policyManager,
        valueInterpreter,
        vaultLib,
        gasRelayPaymasterFactory,
      } = fork.deployment;
      const nonLiveFundDeployer = await createFundDeployer({
        deployer: fork.deployer,
        dispatcher,
        externalPositionManager,
        feeManager,
        gasRelayPaymasterFactory,
        integrationManager,
        policyManager,
        // Do NOT set release as live
        setOnDispatcher: true,

        setReleaseLive: false,

        valueInterpreter,
        vaultLib, // Do set as the current release on the Dispatcher
      });

      await expect(
        nonLiveFundDeployer.createMigrationRequest(
          randomAddress(),
          randomAddress(),
          0,
          constants.HashZero,
          constants.HashZero,
          false,
        ),
      ).rejects.toBeRevertedWith('Release is not yet live');
    });

    it('does not allow a VaultProxy that has a pending migration request', async () => {
      const [fundOwner] = fork.accounts;

      const { vaultProxy } = await createNewFundOnPrevRelease({ fork, fundOwner });

      await createMigrationRequest({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer,
        signer: fundOwner,
        vaultProxy,
      });

      // The second request should fail as the first request is already created and pending
      await expect(
        createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: fundOwner,
          vaultProxy,
        }),
      ).rejects.toBeRevertedWith('A MigrationRequest already exists');
    });
  });

  describe('happy paths', () => {
    describe('fund owner as caller, no failure bypass', () => {
      let fundOwner: SignerWithAddress;
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let denominationAsset: ITestStandardToken, sharesActionTimelock: BigNumber;
      let createMigrationRequestReceipt: ContractReceipt<any>;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        [fundOwner] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
        sharesActionTimelock = BigNumber.from(123);

        // Note that ComptrollerProxyDeployed event is asserted within helper
        const migratedFundRes = await createMigrationRequest({
          bypassPrevReleaseFailure: false,
          denominationAsset,
          fundDeployer,
          sharesActionTimelock,
          signer: fundOwner,
          vaultProxy, // Not necessary to define, but explicit
        });

        nextComptrollerProxy = migratedFundRes.comptrollerProxy;
        createMigrationRequestReceipt = migratedFundRes.receipt;
      });

      it('correctly calls the lifecycle setVaultProxy() function', async () => {
        expect(nextComptrollerProxy.setVaultProxy).toHaveBeenCalledOnContractWith(vaultProxy);
      });

      it('does NOT call the lifecycle activate() function', async () => {
        expect(nextComptrollerProxy.activate).not.toHaveBeenCalledOnContract();
      });

      it('correctly sets the ComptrollerProxy state values', async () => {
        expect(await nextComptrollerProxy.getDenominationAsset()).toMatchAddress(denominationAsset);
        expect(await nextComptrollerProxy.getSharesActionTimelock()).toEqBigNumber(sharesActionTimelock);
        expect(await nextComptrollerProxy.getVaultProxy()).toMatchAddress(vaultProxy);
      });

      it('correctly emits the MigrationRequestCreated event', async () => {
        assertEvent(createMigrationRequestReceipt, 'MigrationRequestCreated', {
          comptrollerProxy: nextComptrollerProxy,
          creator: fundOwner,
          vaultProxy,
        });
      });

      it('correctly calls the Dispatcher to signal the migration', async () => {
        expect(fork.deployment.dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
          vaultProxy,
          nextComptrollerProxy,
          fork.deployment.vaultLib,
          false,
        );
      });
    });

    describe('migrator as caller, with failure bypass', () => {
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner, migrator] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        // Set the migrator
        await vaultProxy.setMigrator(migrator);

        const migratedFundRes = await createMigrationRequest({
          bypassPrevReleaseFailure: true,
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: migrator,
          vaultProxy,
        });

        nextComptrollerProxy = migratedFundRes.comptrollerProxy;
      });

      it('correctly calls the Dispatcher to signal the migration, with failure bypass', async () => {
        expect(fork.deployment.dispatcher.signalMigration).toHaveBeenCalledOnContractWith(
          vaultProxy,
          nextComptrollerProxy,
          fork.deployment.vaultLib,
          true,
        );
      });
    });
  });
});

describe('executeMigration', () => {
  describe('unhappy paths', () => {
    let fundDeployer: FundDeployer;
    let fundOwner: SignerWithAddress, vaultProxy: VaultLib;
    let randomUser: SignerWithAddress;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;

      [fundOwner, randomUser] = fork.accounts;

      const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

      vaultProxy = newFundRes.vaultProxy;

      await createMigrationRequest({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer,
        signer: fundOwner,
        vaultProxy,
      });
    });

    it('cannot be called by a random user', async () => {
      await expect(fundDeployer.connect(randomUser).executeMigration(vaultProxy, false)).rejects.toBeRevertedWith(
        'Only a permissioned migrator can call this function',
      );
    });
  });

  describe('happy paths', () => {
    describe('fund owner as caller, no failure bypass', () => {
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        const migratedFundRes = await createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: fundOwner,
          vaultProxy,
        });

        nextComptrollerProxy = migratedFundRes.comptrollerProxy;

        // Warp to migratable time
        const migrationTimelock = await fork.deployment.dispatcher.getMigrationTimelock();

        await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

        await fundDeployer.connect(fundOwner).executeMigration(vaultProxy, false);
      });

      it('correctly calls the lifecycle activate() function', async () => {
        expect(nextComptrollerProxy.activate).toHaveBeenCalledOnContractWith(true);
      });

      it('correctly calls the Dispatcher to execute the migration', async () => {
        expect(fork.deployment.dispatcher.executeMigration).toHaveBeenCalledOnContractWith(vaultProxy, false);
      });

      it('correctly calls the ProtocolFeeTracker to initialize the protocol fee', async () => {
        expect(fork.deployment.protocolFeeTracker.initializeForVault).toHaveBeenCalledOnContractWith(vaultProxy);
      });

      it('correctly sets the nextComptrollerProxy as the vaultProxy accessor', async () => {
        expect(await vaultProxy.getAccessor()).toMatchAddress(nextComptrollerProxy);
      });
    });

    describe('migrator as caller, with failure bypass', () => {
      let vaultProxy: VaultLib;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner, migrator] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        await createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: fundOwner,
          vaultProxy,
        });

        // Warp to migratable time
        const migrationTimelock = await fork.deployment.dispatcher.getMigrationTimelock();

        await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

        // Set the migrator
        await vaultProxy.setMigrator(migrator);

        await fundDeployer.connect(migrator).executeMigration(vaultProxy, true);
      });

      it('correctly calls the Dispatcher to execute the migration', async () => {
        expect(fork.deployment.dispatcher.executeMigration).toHaveBeenCalledOnContractWith(vaultProxy, true);
      });
    });
  });
});

describe('cancelMigration', () => {
  describe('unhappy paths', () => {
    let fundDeployer: FundDeployer;
    let fundOwner: SignerWithAddress, vaultProxy: VaultLib;
    let randomUser: SignerWithAddress;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;

      [fundOwner, randomUser] = fork.accounts;

      const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

      vaultProxy = newFundRes.vaultProxy;

      await createMigrationRequest({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer,
        signer: fundOwner,
        vaultProxy,
      });
    });

    it('cannot be called by a random user', async () => {
      await expect(fundDeployer.connect(randomUser).cancelMigration(vaultProxy, false)).rejects.toBeRevertedWith(
        'Only a permissioned migrator can call this function',
      );
    });
  });

  describe('happy paths', () => {
    describe('fund owner as caller, no failure bypass', () => {
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        const migratedFundRes = await createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: fundOwner,
          vaultProxy,
        });

        nextComptrollerProxy = migratedFundRes.comptrollerProxy;

        await fundDeployer.connect(fundOwner).cancelMigration(vaultProxy, false);
      });

      it('correctly calls the Dispatcher to cancel the migration', async () => {
        expect(fork.deployment.dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(vaultProxy, false);
      });

      it('correctly calls to destruct the canceled nextComptrollerProxy', async () => {
        expect(nextComptrollerProxy.destructUnactivated).toHaveBeenCalledOnContract();
      });
    });

    describe('migrator as caller, with failure bypass', () => {
      let vaultProxy: VaultLib;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner, migrator] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });

        vaultProxy = newFundRes.vaultProxy;

        await createMigrationRequest({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
          fundDeployer,
          signer: fundOwner,
          vaultProxy,
        });

        // Set the migrator
        await vaultProxy.setMigrator(migrator);

        await fundDeployer.connect(migrator).cancelMigration(vaultProxy, true);
      });

      it('correctly calls the Dispatcher to cancel the migration', async () => {
        expect(fork.deployment.dispatcher.cancelMigration).toHaveBeenCalledOnContractWith(vaultProxy, true);
      });
    });
  });
});

describe('invokeMigrationInCancelHook', () => {
  it('does not allow a random caller', async () => {
    fork = await deployProtocolFixture();

    const [randomUser] = fork.accounts;

    await expect(
      fork.deployment.fundDeployer
        .connect(randomUser)
        .invokeMigrationInCancelHook(
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
        ),
    ).rejects.toBeRevertedWith('Only Dispatcher can call this function');
  });
});
