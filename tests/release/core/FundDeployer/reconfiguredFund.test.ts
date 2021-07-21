import { ContractReceipt } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, FundDeployer, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  assertEvent,
  createFundDeployer,
  createMigrationRequest,
  createNewFund,
  createReconfigurationRequest,
  createVaultProxy,
  deployProtocolFixture,
  ProtocolDeployment,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

describe('setReconfigurationTimelock', () => {
  it('cannot be called by a random user', async () => {
    const fork = await deployProtocolFixture();
    const [randomUser] = fork.accounts;

    await expect(
      fork.deployment.fundDeployer.connect(randomUser).setReconfigurationTimelock(123),
    ).rejects.toBeRevertedWith('Only the contract owner can call this function');
  });

  describe('happy path', () => {
    let fork: ProtocolDeployment;
    let fundDeployer: FundDeployer;
    let nextTimelock: BigNumber;
    let setReconfigurationTimelockReceipt: ContractReceipt<any>;
    beforeAll(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;

      const prevTimelock = await fundDeployer.getReconfigurationTimelock();
      nextTimelock = prevTimelock.add(123);

      setReconfigurationTimelockReceipt = await fundDeployer.setReconfigurationTimelock(nextTimelock);
    });

    it('correctly updates the reconfigurationTimelock', async () => {
      expect(await fundDeployer.getReconfigurationTimelock()).toEqBigNumber(nextTimelock);
    });

    it('correctly emits the ReconfigurationTimelockSet event', async () => {
      assertEvent(setReconfigurationTimelockReceipt, 'ReconfigurationTimelockSet', { nextTimelock });
    });
  });
});

describe('createReconfigurationRequest', () => {
  describe('unhappy paths', () => {
    let fork: ProtocolDeployment;
    let fundDeployer: FundDeployer;
    let fundOwner: SignerWithAddress, randomUser: SignerWithAddress;
    let vaultProxy: VaultLib;
    let denominationAsset: StandardToken;
    beforeEach(async () => {
      fork = await deployProtocolFixture();
      [fundOwner, randomUser] = fork.accounts;
      fundDeployer = fork.deployment.fundDeployer;

      const newFundRes = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      vaultProxy = newFundRes.vaultProxy;
      denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
    });

    // Other validations covered by common logic in createNewFund() tests

    it('cannot be called by a random user', async () => {
      await expect(
        createReconfigurationRequest({
          signer: randomUser,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        }),
      ).rejects.toBeRevertedWith('Only a permissioned migrator can call this function');
    });

    it('does not allow a VaultProxy that is not on the same release as the FundDeployer', async () => {
      // Create a VaultProxy that is not attached to a release
      const fakeVaultProxy = await createVaultProxy({
        signer: fundOwner,
        vaultLib: fork.deployment.vaultLib,
        fundOwner,
        fundAccessor: randomUser,
      });

      await expect(
        createReconfigurationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy: fakeVaultProxy,
          denominationAsset,
        }),
      ).rejects.toBeRevertedWith('VaultProxy not on this release');
    });

    it('does not allow a VaultProxy that has a pending reconfiguration request', async () => {
      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset,
      });

      // Creating a second reconfiguration request for the vaultProxy should fail
      await expect(
        createReconfigurationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset,
        }),
      ).rejects.toBeRevertedWith('VaultProxy has a pending reconfiguration request');
    });
  });

  describe('happy paths', () => {
    it('allows the migrator as caller', async () => {
      const fork = await deployProtocolFixture();
      const [fundOwner, migrator] = fork.accounts;
      const fundDeployer = fork.deployment.fundDeployer;

      const denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);

      const { vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset,
      });

      // Set the migrator
      await vaultProxy.setMigrator(migrator);

      await createReconfigurationRequest({
        signer: migrator,
        fundDeployer,
        vaultProxy,
        denominationAsset,
      });
    });

    describe('fund owner as caller', () => {
      let fork: ProtocolDeployment;
      let fundDeployer: FundDeployer;
      let fundOwner: SignerWithAddress;
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let denominationAsset: StandardToken, sharesActionTimelock: BigNumber;
      let createReconfigurationRequestReceipt: ContractReceipt<any>;
      let expectedExecutableTimestamp: BigNumber;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        [fundOwner] = fork.accounts;
        fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFund({
          signer: fundOwner,
          fundDeployer,
          fundOwner,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        });

        vaultProxy = newFundRes.vaultProxy;

        denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
        sharesActionTimelock = BigNumber.from(123);

        // Note that ComptrollerProxyDeployed event is asserted within helper
        const reconfiguredFundRes = await createReconfigurationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset,
          sharesActionTimelock,
        });

        nextComptrollerProxy = reconfiguredFundRes.comptrollerProxy;
        createReconfigurationRequestReceipt = reconfiguredFundRes.receipt;

        expectedExecutableTimestamp = (await fundDeployer.getReconfigurationTimelock()).add(
          await transactionTimestamp(createReconfigurationRequestReceipt),
        );
      });

      it('correctly stores the ReconfigurationRequest', async () => {
        const reconfigurationRequestDetailsRes = await fundDeployer.getReconfigurationRequestForVaultProxy(vaultProxy);

        expect(reconfigurationRequestDetailsRes).toMatchFunctionOutput(
          fundDeployer.getReconfigurationRequestForVaultProxy,
          {
            nextComptrollerProxy,
            executableTimestamp: expectedExecutableTimestamp,
          },
        );
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

      it('correctly emits the ReconfigurationRequestCreated event', async () => {
        assertEvent(createReconfigurationRequestReceipt, 'ReconfigurationRequestCreated', {
          creator: fundOwner,
          vaultProxy,
          comptrollerProxy: nextComptrollerProxy,
          executableTimestamp: expectedExecutableTimestamp,
        });
      });
    });
  });
});

describe('executeReconfiguration', () => {
  describe('unhappy paths', () => {
    let fork: ProtocolDeployment;
    let fundDeployer: FundDeployer;
    let fundOwner: SignerWithAddress, vaultProxy: VaultLib;
    let randomUser: SignerWithAddress;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;

      [fundOwner, randomUser] = fork.accounts;

      const newFundRes = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      vaultProxy = newFundRes.vaultProxy;
    });

    it('cannot be called by a random user', async () => {
      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      await expect(fundDeployer.connect(randomUser).executeReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        'Only a permissioned migrator can call this function',
      );
    });

    it('does not allow a vaultProxy that does not have a reconfiguration request', async () => {
      await expect(fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        'No reconfiguration request exists for _vaultProxy',
      );
    });

    it('cannot be called before the timelock expires', async () => {
      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      await expect(fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        'The reconfiguration timelock has not elapsed',
      );
    });

    it('does not allow a VaultProxy that is not on the same release as the FundDeployer', async () => {
      // Create the reconfigured ComptrollerProxy prior to migrating to a new release
      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Migrate the vaultProxy to a new release
      const nextFundDeployer = await createFundDeployer({
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

      await createMigrationRequest({
        signer: fundOwner,
        fundDeployer: nextFundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Warp to migration executable time
      const migrationTimelock = await fork.deployment.dispatcher.getMigrationTimelock();
      await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

      await nextFundDeployer.connect(fundOwner).executeMigration(vaultProxy, false);

      // Warp to reconfiguration executable time
      const reconfigurationTimelock = await fundDeployer.getReconfigurationTimelock();
      await provider.send('evm_increaseTime', [reconfigurationTimelock.toNumber()]);

      // Executing reconfiguration for the VaultProxy that has already migrated to the
      // next release should fail
      await expect(fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        '_vaultProxy is no longer on this release',
      );
    });
  });

  describe('happy paths', () => {
    it('allows the migrator as caller', async () => {
      const fork = await deployProtocolFixture();

      const [fundOwner, migrator] = fork.accounts;
      const fundDeployer = fork.deployment.fundDeployer;

      const { vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Warp to executable time
      const reconfigurationTimelock = await fundDeployer.getReconfigurationTimelock();
      await provider.send('evm_increaseTime', [reconfigurationTimelock.toNumber()]);

      // Set the migrator
      await vaultProxy.setMigrator(migrator);

      await fundDeployer.connect(migrator).executeReconfiguration(vaultProxy);
    });

    describe('fund owner as caller', () => {
      let fork: ProtocolDeployment;
      let fundDeployer: FundDeployer;
      let prevComptrollerProxy: ComptrollerLib, nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let executeReconfigurationReceipt: ContractReceipt<any>;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner] = fork.accounts;
        fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFund({
          signer: fundOwner,
          fundDeployer,
          fundOwner,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        });

        prevComptrollerProxy = newFundRes.comptrollerProxy;
        vaultProxy = newFundRes.vaultProxy;

        const reconfiguredFundRes = await createReconfigurationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        });

        nextComptrollerProxy = reconfiguredFundRes.comptrollerProxy;

        // Warp to executable time
        const reconfigurationTimelock = await fundDeployer.getReconfigurationTimelock();
        await provider.send('evm_increaseTime', [reconfigurationTimelock.toNumber()]);

        executeReconfigurationReceipt = await fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy);
      });

      it('correctly sets the nextComptrollerProxy as the vaultProxy accessor', async () => {
        expect(await vaultProxy.getAccessor()).toMatchAddress(nextComptrollerProxy);
      });

      it('deletes the reconfiguration request', async () => {
        expect(await fundDeployer.getReconfigurationRequestForVaultProxy(vaultProxy)).toMatchFunctionOutput(
          fundDeployer.getReconfigurationRequestForVaultProxy,
          {
            nextComptrollerProxy: constants.AddressZero,
            executableTimestamp: 0,
          },
        );
      });

      it('correctly calls the lifecycle destructActivated() function for the old ComptrollerProxy', async () => {
        expect(prevComptrollerProxy.destructActivated).toHaveBeenCalledOnContract();
      });

      it('correctly calls the lifecycle activate() function for the new ComptrollerProxy', async () => {
        expect(nextComptrollerProxy.activate).toHaveBeenCalledOnContractWith(true);
      });

      it('correctly emits the ReconfigurationRequestExecuted event', async () => {
        assertEvent(executeReconfigurationReceipt, 'ReconfigurationRequestExecuted', {
          vaultProxy,
          prevComptrollerProxy,
          nextComptrollerProxy,
        });
      });
    });
  });
});

describe('cancelReconfiguration', () => {
  describe('unhappy paths', () => {
    let fork: ProtocolDeployment;
    let fundDeployer: FundDeployer;
    let fundOwner: SignerWithAddress, vaultProxy: VaultLib;
    let randomUser: SignerWithAddress;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      fundDeployer = fork.deployment.fundDeployer;

      [fundOwner, randomUser] = fork.accounts;

      const newFundRes = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      vaultProxy = newFundRes.vaultProxy;
    });

    it('cannot be called by a random user', async () => {
      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      await expect(fundDeployer.connect(randomUser).cancelReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        'Only a permissioned migrator can call this function',
      );
    });

    it('does not allow a vaultProxy that does not have a reconfiguration request', async () => {
      await expect(fundDeployer.connect(fundOwner).cancelReconfiguration(vaultProxy)).rejects.toBeRevertedWith(
        'No reconfiguration request exists for _vaultProxy',
      );
    });
  });

  describe('happy paths', () => {
    it('allows the migrator as caller', async () => {
      const fork = await deployProtocolFixture();

      const [fundOwner, migrator] = fork.accounts;
      const fundDeployer = fork.deployment.fundDeployer;

      const { vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Set the migrator
      await vaultProxy.setMigrator(migrator);

      await fundDeployer.connect(migrator).cancelReconfiguration(vaultProxy);
    });

    describe('fund owner as caller', () => {
      let fork: ProtocolDeployment;
      let fundDeployer: FundDeployer;
      let nextComptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let cancelReconfigurationReceipt: ContractReceipt<any>;

      beforeAll(async () => {
        fork = await deployProtocolFixture();

        const [fundOwner] = fork.accounts;
        fundDeployer = fork.deployment.fundDeployer;

        const newFundRes = await createNewFund({
          signer: fundOwner,
          fundDeployer,
          fundOwner,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        });

        vaultProxy = newFundRes.vaultProxy;

        const reconfiguredFundRes = await createReconfigurationRequest({
          signer: fundOwner,
          fundDeployer,
          vaultProxy,
          denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        });

        nextComptrollerProxy = reconfiguredFundRes.comptrollerProxy;

        cancelReconfigurationReceipt = await fundDeployer.connect(fundOwner).cancelReconfiguration(vaultProxy);
      });

      it('deletes the reconfiguration request', async () => {
        expect(await fundDeployer.getReconfigurationRequestForVaultProxy(vaultProxy)).toMatchFunctionOutput(
          fundDeployer.getReconfigurationRequestForVaultProxy,
          {
            nextComptrollerProxy: constants.AddressZero,
            executableTimestamp: 0,
          },
        );
      });

      it('correctly calls the lifecycle destructUnactivated() function for the new ComptrollerProxy', async () => {
        expect(nextComptrollerProxy.destructUnactivated).toHaveBeenCalledOnContract();
      });

      it('correctly emits the ReconfigurationRequestCancelled event', async () => {
        assertEvent(cancelReconfigurationReceipt, 'ReconfigurationRequestCancelled', {
          vaultProxy,
          nextComptrollerProxy,
        });
      });
    });
  });
});
