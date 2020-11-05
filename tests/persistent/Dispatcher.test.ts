import { constants, BigNumber } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
  sameAddress,
  AddressLike,
  MockContract,
} from '@crestproject/crestproject';
import { assertEvent, defaultPersistetTestDeployment, transactionTimestamp } from '@melonproject/testutils';
import { Dispatcher, IMigrationHookHandler, MockVaultLib, MigrationOutHook } from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await defaultPersistetTestDeployment(provider);

  return {
    accounts,
    config,
    deployment,
  };
}

async function snapshotWithMocks(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await snapshot(provider);

  const mockVaultLib1 = await MockVaultLib.deploy(config.deployer);
  const mockVaultLib2 = await MockVaultLib.deploy(config.deployer);

  // Create mock FundDeployer instances with hooks implemented.
  // We can unset hooks in individual tests to test failure behavior.
  const mockFundDeployer1 = await IMigrationHookHandler.mock(config.deployer);
  await mockFundDeployer1.implementMigrationOutHook.returns(undefined);

  const mockFundDeployer2 = await IMigrationHookHandler.mock(config.deployer);
  await mockFundDeployer2.implementMigrationInCancelHook.returns(undefined);

  return {
    accounts,
    config,
    deployment,
    mockFundDeployer1,
    mockFundDeployer2,
    mockVaultLib1,
    mockVaultLib2,
  };
}

async function ensureFundDeployer({ dispatcher, fundDeployer }: { dispatcher: Dispatcher; fundDeployer: AddressLike }) {
  const currentDeployer = await dispatcher.getCurrentFundDeployer();
  if (!sameAddress(currentDeployer, fundDeployer)) {
    const receipt = await dispatcher.setCurrentFundDeployer(fundDeployer);
    assertEvent(receipt, 'CurrentFundDeployerSet', {
      prevFundDeployer: currentDeployer,
      nextFundDeployer: fundDeployer,
    });
  }
}

async function deployVault({
  dispatcher,
  mockFundDeployer,
  vaultLib,
  owner = randomAddress(),
  vaultAccessor = randomAddress(),
  fundName = 'My Fund',
}: {
  dispatcher: Dispatcher;
  mockFundDeployer: MockContract<IMigrationHookHandler>;
  vaultLib: AddressLike;
  owner?: AddressLike;
  vaultAccessor?: AddressLike;
  fundName?: string;
}) {
  await ensureFundDeployer({ dispatcher, fundDeployer: mockFundDeployer });

  const event = dispatcher.abi.getEvent('VaultProxyDeployed');
  const receipt = await mockFundDeployer.forward(dispatcher.deployVaultProxy, vaultLib, owner, vaultAccessor, fundName);

  const args = assertEvent(receipt, event, {
    fundName,
    owner,
    vaultAccessor,
    vaultLib,
    fundDeployer: mockFundDeployer,
    vaultProxy: expect.any(String) as string,
  });

  return new MockVaultLib(args.vaultProxy, provider);
}

async function signalMigration({
  dispatcher,
  vaultProxy,
  mockNextFundDeployer,
  nextVaultLib,
  nextVaultAccessor = randomAddress(),
  bypassFailure = false,
}: {
  dispatcher: Dispatcher;
  vaultProxy: MockVaultLib;
  mockNextFundDeployer: MockContract<IMigrationHookHandler>;
  nextVaultLib: AddressLike;
  nextVaultAccessor?: AddressLike;
  bypassFailure?: boolean;
}) {
  await ensureFundDeployer({
    dispatcher,
    fundDeployer: mockNextFundDeployer,
  });

  return mockNextFundDeployer.forward(
    dispatcher.signalMigration,
    vaultProxy,
    nextVaultAccessor,
    nextVaultLib,
    bypassFailure,
  );
}

describe('constructor', () => {
  it('sets initial state', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer },
    } = await provider.snapshot(snapshot);

    const getOwnerCall = await dispatcher.getOwner();
    expect(getOwnerCall).toMatchAddress(deployer);

    const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    const getCurrentFundDeployerCall = await dispatcher.getCurrentFundDeployer();
    expect(getCurrentFundDeployerCall).toMatchAddress(constants.AddressZero);
  });
});

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: [randomUser],
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.connect(randomUser).setNominatedOwner(randomAddress())).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.setNominatedOwner(constants.AddressZero)).rejects.toBeRevertedWith(
      '_nextNominatedOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer: currentOwner },
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.setNominatedOwner(currentOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already the owner',
    );
  });

  it('does not allow the next owner to already be nominated', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Nominate the nextOwner a first time
    const nextOwner = randomAddress();
    await dispatcher.setNominatedOwner(nextOwner);

    // Attempt to nominate the same nextOwner a second time
    await expect(dispatcher.setNominatedOwner(nextOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const {
      config: { deployer },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Nominate the nextOwner a first time
    const nextOwnerAddress = randomAddress();
    const receipt = await dispatcher.setNominatedOwner(nextOwnerAddress);

    // NominatedOwnerSet event properly emitted
    assertEvent(receipt, 'NominatedOwnerSet', {
      nominatedOwner: nextOwnerAddress,
    });

    // New owner should have been nominated
    const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(nextOwnerAddress);

    // Ownership should not have changed
    const getOwnerCall = await dispatcher.getOwner();
    expect(getOwnerCall).toMatchAddress(deployer);
  });
});

describe('removeNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: [randomUser],
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    await dispatcher.setNominatedOwner(randomAddress());

    // Attempt by a random user to remove nominated owner should fail
    await expect(dispatcher.connect(randomUser).removeNominatedOwner()).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('correctly handles removing the nomination', async () => {
    const {
      config: { deployer },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    const nextOwnerAddress = randomAddress();
    await dispatcher.setNominatedOwner(nextOwnerAddress);

    // Attempt by a random user to remove nominated owner should fail
    const receipt = await dispatcher.removeNominatedOwner();

    // NominatedOwnerRemoved event properly emitted
    assertEvent(receipt, 'NominatedOwnerRemoved', {
      nominatedOwner: nextOwnerAddress,
    });

    // Nomination should have been removed
    const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    // Ownership should not have changed
    const getOwnerCall = await dispatcher.getOwner();
    expect(getOwnerCall).toMatchAddress(deployer);
  });
});

describe('claimOwnership', () => {
  it('can only be called by the nominatedOwner', async () => {
    const {
      accounts: [randomUser],
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    await dispatcher.setNominatedOwner(randomAddress());

    // Attempt by a random user to claim ownership should fail
    await expect(dispatcher.connect(randomUser).claimOwnership()).rejects.toBeRevertedWith(
      'Only the nominatedOwner can call this function',
    );
  });

  it('correctly handles transferring ownership', async () => {
    const {
      accounts: [nominatedOwner],
      config: { deployer },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    await dispatcher.setNominatedOwner(nominatedOwner);

    // Claim ownership
    const receipt = await dispatcher.connect(nominatedOwner).claimOwnership();

    // OwnershipTransferred event properly emitted
    assertEvent(receipt, 'OwnershipTransferred', {
      prevOwner: deployer,
      nextOwner: nominatedOwner,
    });

    // Owner should now be the nominatedOwner
    const getOwnerCall = await dispatcher.getOwner();
    expect(getOwnerCall).toMatchAddress(nominatedOwner);

    // nominatedOwner should be empty
    const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);
  });
});

describe('deployVaultProxy', () => {
  it.todo('does not allow a bad VaultLib');

  it('correctly deploys a new VaultProxy', async () => {
    const {
      deployment: { dispatcher },
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    const owner = randomAddress();
    const vaultAccessor = randomAddress();
    const fundName = 'Mock Fund';
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer,
      vaultLib,
      owner,
      vaultAccessor,
      fundName,
    });

    // Assert VaultLib state
    const creatorCall = await vaultProxy.getCreator();
    expect(creatorCall).toMatchAddress(dispatcher);

    const accessorCall = await vaultProxy.getAccessor();
    expect(accessorCall).toMatchAddress(vaultAccessor);

    const migratorCall = await vaultProxy.getMigrator();
    expect(migratorCall).toMatchAddress(constants.AddressZero);

    const ownerCall = await vaultProxy.getOwner();
    expect(ownerCall).toMatchAddress(owner);

    const initializedCall = await vaultProxy.getInitialized();
    expect(initializedCall).toBe(true);

    // Assert ERC20 state
    const nameCall = await vaultProxy.name();
    expect(nameCall).toBe(fundName);

    const symbolCall = await vaultProxy.symbol();
    expect(symbolCall).toBe('MLNF');

    const decimalsCall = await vaultProxy.decimals();
    expect(decimalsCall).toBe(18);

    // TODO: Check VaultProxy events and ERC20 events
  });
});

describe('signalMigration', () => {
  it.todo('does not allow empty values');

  it.todo('does not allow non-existent VaultProxy');

  it.todo('cannot be called by a previous FundDeployer');

  it.todo('cannot be called if fund is already on the current FundDeployer');

  it('correctly handles MigrationOutHook.PreSignal failure', async () => {
    const {
      deployment: { dispatcher },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
    });

    const nextVaultAccessor = randomAddress();

    // Make MigrationOutHook implementation fail
    const revertReason = 'test revert';
    // TODO: revert specifically for MigrationOutHook.PreSignal
    await mockPrevFundDeployer.implementMigrationOutHook
      .given(MigrationOutHook.PreSignal, vaultProxy, mockNextFundDeployer, nextVaultAccessor, nextVaultLib)
      .reverts(revertReason);

    await expect(
      signalMigration({
        dispatcher,
        mockNextFundDeployer,
        nextVaultLib,
        vaultProxy,
        nextVaultAccessor,
      }),
    ).rejects.toBeRevertedWith(revertReason);

    // Bypassing the failure should allow the tx to succeed and fire the failure event
    const receipt = await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
      bypassFailure: true,
    });

    assertEvent(receipt, 'MigrationOutHookFailed', {
      failureReturnData: expect.any(String),
      hook: MigrationOutHook.PreSignal,
      vaultProxy: vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib,
    });
  });

  it.todo('correctly handles postSignalMigrationOriginHook failure');

  it('correctly signals a migration', async () => {
    const {
      deployment: { dispatcher },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const receipt = await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    assertEvent(receipt, 'MigrationSignaled', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    });

    const signalTimestamp = await transactionTimestamp(receipt);
    const detailsCall = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    expect(detailsCall).toMatchFunctionOutput(dispatcher.getMigrationRequestDetailsForVaultProxy.fragment, {
      nextFundDeployer_: mockNextFundDeployer,
      nextVaultAccessor_: nextVaultAccessor,
      nextVaultLib_: nextVaultLib,
      signalTimestamp_: signalTimestamp,
    });

    expect(mockPrevFundDeployer.implementMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockPrevFundDeployer.implementMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PostSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );
  });
});

describe('cancelMigration', () => {
  it.todo('does not allow empty values');

  it.todo('does not allow non-existent migration request');

  it.todo('can only be called by the vaultProxy owner or migrator, or the FundDeployer in the migration request');

  it.todo('correctly handles postCancelMigrationOriginHook failure');

  it.todo('correctly handles postCancelMigrationTargetHook failure');

  it('correctly cancels a migration request', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const signalReceipt = await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    const signalTimestamp = await transactionTimestamp(signalReceipt);

    // Cancel migration (as owner / deployer)
    const cancelReceipt = await dispatcher.cancelMigration(vaultProxy, false);
    assertEvent(cancelReceipt, 'MigrationCancelled', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp: BigNumber.from(signalTimestamp),
    });

    // Removes MigrationRequest
    const detailsCall = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    expect(detailsCall).toMatchFunctionOutput(dispatcher.getMigrationRequestDetailsForVaultProxy.fragment, {
      nextFundDeployer_: constants.AddressZero,
      nextVaultAccessor_: constants.AddressZero,
      nextVaultLib_: constants.AddressZero,
      signalTimestamp_: BigNumber.from(0),
    });

    expect(mockPrevFundDeployer.implementMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockNextFundDeployer.implementMigrationInCancelHook).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockPrevFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );
  });
});

describe('executeMigration', () => {
  it.todo('does not allow empty values');

  it.todo('does not allow non-existent migration request');

  it.todo('can only be called by the target FundDeployer in the migration request');

  it.todo(
    'cannot be called when the target FundDeployer in the migration request is no longer the current FundDeployer',
  );

  it('cannot be called when the migration timelock has not yet been met', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Try to migrate immediately, which should fail
    await expect(mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false)).rejects.toBeRevertedWith(
      'The migration timelock has not been met',
    );

    // Warp to 5 secs prior to the timelock expiry, which should also fail
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() - 5]);

    // Try to migrate again, which should fail
    await expect(mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false)).rejects.toBeRevertedWith(
      'The migration timelock has not been met',
    );
  });

  it.todo('correctly handles preMigrateOriginHook failure');

  it.todo('correctly handles postMigrateOriginHook failure');

  it('correctly executes a migration request', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const singalReceipt = await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    const signalTimestamp = await transactionTimestamp(singalReceipt);

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Execute migration
    const executeReceipt = await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

    assertEvent(executeReceipt, 'MigrationExecuted', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp: BigNumber.from(signalTimestamp),
    });

    // Assert VaultProxy changes
    const vaultLibCall = await vaultProxy.getVaultLib();
    expect(vaultLibCall).toMatchAddress(nextVaultLib);

    const accessorCall = await vaultProxy.getAccessor();
    expect(accessorCall).toMatchAddress(nextVaultAccessor);

    // Removes MigrationRequest
    const detailsCall = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    expect(detailsCall).toMatchFunctionOutput(dispatcher.getMigrationRequestDetailsForVaultProxy.fragment, {
      nextFundDeployer_: constants.AddressZero,
      nextVaultAccessor_: constants.AddressZero,
      nextVaultLib_: constants.AddressZero,
      signalTimestamp_: BigNumber.from(0),
    });

    expect(mockPrevFundDeployer.implementMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreMigrate,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockPrevFundDeployer.implementMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PostMigrate,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );
  });
});

describe('setMigrationTimelock', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: [randomUser],
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.connect(randomUser).setMigrationTimelock(randomAddress())).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow the current migrationTimelock value', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    const migrationTimelock = await dispatcher.getMigrationTimelock();

    await expect(dispatcher.setMigrationTimelock(migrationTimelock)).rejects.toBeRevertedWith(
      '_nextTimelock is the current timelock',
    );
  });

  it('correctly handles setting a new migration timelock', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set a new timelock
    const prevTimelock = await dispatcher.getMigrationTimelock();
    const nextTimelock = prevTimelock.add(1);
    const receipt = await dispatcher.setMigrationTimelock(nextTimelock);

    // MigrationTimelockSet event properly emitted
    assertEvent(receipt, 'MigrationTimelockSet', {
      prevTimelock,
      nextTimelock,
    });

    // migrationTimelock should have updated to the new value
    const getMigrationTimelockCall = await dispatcher.getMigrationTimelock();
    expect(getMigrationTimelockCall).toEqBigNumber(nextTimelock);
  });
});
