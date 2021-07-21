import { ContractReceipt, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, FundDeployer, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  assertEvent,
  createFundDeployer,
  createMigrationRequest,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
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
    assetFinalityResolver: fork.deployment.assetFinalityResolver,
    chainlinkPriceFeed: fork.deployment.chainlinkPriceFeed,
    externalPositionManager: fork.deployment.externalPositionManager,
    dispatcher: fork.deployment.dispatcher,
    feeManager: fork.deployment.feeManager,
    integrationManager: fork.deployment.integrationManager,
    policyManager: fork.deployment.policyManager,
    valueInterpreter: fork.deployment.valueInterpreter,
    vaultLib: fork.deployment.vaultLib,
    setReleaseLive: true,
    setOnDispatcher: true,
  });

  // Create fund on old release
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundDeployer: prevFundDeployer,
    fundOwner,
    fundName: 'My Fund',
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
          signer: randomUser,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        }),
      ).rejects.toBeRevertedWith('Only a permissioned migrator can call this function');
    });

    it('does not allow ownership handoff to not be incomplete', async () => {
      const {
        assetFinalityResolver,
        chainlinkPriceFeed,
        externalPositionManager,
        dispatcher,
        feeManager,
        integrationManager,
        policyManager,
        valueInterpreter,
        vaultLib,
      } = fork.deployment;
      const nonLiveFundDeployer = await createFundDeployer({
        deployer: fork.deployer,
        assetFinalityResolver,
        chainlinkPriceFeed,
        externalPositionManager,
        dispatcher,
        feeManager,
        integrationManager,
        policyManager,
        valueInterpreter,
        vaultLib,
        setReleaseLive: false, // Do NOT set release as live
        setOnDispatcher: true, // Do set as the current release on the Dispatcher
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
  });

  describe('happy paths', () => {
    describe('fund owner as caller, no failure bypass', () => {
      let fundOwner: SignerWithAddress;
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let denominationAsset: StandardToken, sharesActionTimelock: BigNumber;
      let createMigrationRequestReceipt: ContractReceipt<any>;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        [fundOwner] = fork.accounts;
        const fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFundOnPrevRelease({ fork, fundOwner });
        vaultProxy = newFundRes.vaultProxy;

        denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
        sharesActionTimelock = BigNumber.from(123);

        // Note that ComptrollerProxyDeployed event is asserted within helper
        const migratedFundRes = await createMigrationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset,
          sharesActionTimelock,
          bypassPrevReleaseFailure: false, // Not necessary to define, but explicit
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
          creator: fundOwner,
          vaultProxy,
          comptrollerProxy: nextComptrollerProxy,
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
          signer: migrator,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
          bypassPrevReleaseFailure: true,
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
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
