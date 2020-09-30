import { constants, BigNumber } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
  AddressLike,
  MockContract,
  ContractReceipt,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import {
  defaultTestDeployment,
  IMigrationHookHandler,
  Dispatcher,
  MockVaultLib,
} from '../';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await defaultTestDeployment(
    provider,
  );

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

  // Create mock FundDeployer instances with all hooks implemented.
  // We can unset specific hooks in individual tests to test failure behavior.
  const mockFundDeployer1 = await IMigrationHookHandler.mock(config.deployer);
  await mockFundDeployer1.postCancelMigrationOriginHook.returns(undefined);
  await mockFundDeployer1.preMigrateOriginHook.returns(undefined);
  await mockFundDeployer1.postMigrateOriginHook.returns(undefined);
  await mockFundDeployer1.preSignalMigrationOriginHook.returns(undefined);
  await mockFundDeployer1.postSignalMigrationOriginHook.returns(undefined);

  const mockFundDeployer2 = await IMigrationHookHandler.mock(config.deployer);
  await mockFundDeployer2.postCancelMigrationTargetHook.returns(undefined);

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

async function ensureFundDeployer({
  dispatcher,
  fundDeployer,
}: {
  dispatcher: Dispatcher;
  fundDeployer: AddressLike;
}) {
  const currentDeployer = await dispatcher.getCurrentFundDeployer();
  const nextDeployerAddress = await resolveAddress(fundDeployer);
  if (currentDeployer != nextDeployerAddress) {
    const fundDeployerTx = dispatcher.setCurrentFundDeployer(
      nextDeployerAddress,
    );

    await expect(fundDeployerTx).resolves.toBeReceipt();
    await assertEvent(fundDeployerTx, 'CurrentFundDeployerSet', {
      prevFundDeployer: currentDeployer,
      nextFundDeployer: await resolveAddress(fundDeployer),
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
  const forwardTx = mockFundDeployer.forward(
    dispatcher.deployVaultProxy,
    vaultLib,
    owner,
    vaultAccessor,
    fundName,
  );

  const args = await assertEvent(forwardTx, event, {
    fundName,
    owner: await resolveAddress(owner),
    vaultAccessor: await resolveAddress(vaultAccessor),
    fundDeployer: await resolveAddress(mockFundDeployer),
    vaultLib: await resolveAddress(vaultLib),
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

async function transactionTimestamp(
  tx: ContractReceipt<any> | Promise<ContractReceipt<any>>,
) {
  expect(tx).resolves.toBeReceipt();
  const block = await provider.getBlock((await tx).blockNumber);
  return block.timestamp;
}

describe('constructor', () => {
  it('sets initial state', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer },
    } = await provider.snapshot(snapshot);

    const getOwnerCall = dispatcher.getOwner();
    await expect(getOwnerCall).resolves.toBe(await resolveAddress(deployer));

    const getNominatedOwnerCall = dispatcher.getNominatedOwner();
    await expect(getNominatedOwnerCall).resolves.toBe(constants.AddressZero);

    const getCurrentFundDeployerCall = dispatcher.getCurrentFundDeployer();
    await expect(getCurrentFundDeployerCall).resolves.toBe(
      constants.AddressZero,
    );
  });
});

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    const nominateOwnerTx = dispatcher
      .connect(randomUser)
      .setNominatedOwner(randomAddress());
    await expect(nominateOwnerTx).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    const nominateOwnerTx = dispatcher.setNominatedOwner(constants.AddressZero);
    await expect(nominateOwnerTx).rejects.toBeRevertedWith(
      '_nextOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer: currentOwner },
    } = await provider.snapshot(snapshot);

    const nominateOwnerTx = dispatcher.setNominatedOwner(currentOwner);
    await expect(nominateOwnerTx).rejects.toBeRevertedWith(
      '_nextOwner is already the owner',
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
    const nominateOwnerTx = dispatcher.setNominatedOwner(nextOwner);
    await expect(nominateOwnerTx).rejects.toBeRevertedWith(
      '_nextOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const {
      config: { deployer },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Nominate the nextOwner a first time
    const nextOwnerAddress = randomAddress();
    const setNominatedOwnerTx = dispatcher.setNominatedOwner(nextOwnerAddress);
    await expect(setNominatedOwnerTx).resolves.toBeReceipt();

    // New owner should have been nominated
    const getNominatedOwnerCall = dispatcher.getNominatedOwner();
    await expect(getNominatedOwnerCall).resolves.toBe(nextOwnerAddress);

    // Ownership should not have changed
    const getOwnerCall = dispatcher.getOwner();
    await expect(getOwnerCall).resolves.toBe(await resolveAddress(deployer));

    // NominatedOwnerSet event properly emitted
    assertEvent(setNominatedOwnerTx, 'NominatedOwnerSet', {
      nominatedOwner: nextOwnerAddress,
    });
  });
});

describe('removeNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    const setNominatedOwnerTx = dispatcher.setNominatedOwner(randomAddress());
    await expect(setNominatedOwnerTx).resolves.toBeReceipt();

    // Attempt by a random user to remove nominated owner should fail
    const removeNominateOwnerTx = dispatcher
      .connect(randomUser)
      .removeNominatedOwner();
    await expect(removeNominateOwnerTx).rejects.toBeRevertedWith(
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
    const setNominatedOwnerTx = dispatcher.setNominatedOwner(nextOwnerAddress);
    await expect(setNominatedOwnerTx).resolves.toBeReceipt();

    // Attempt by a random user to remove nominated owner should fail
    const removeNominateOwnerTx = dispatcher.removeNominatedOwner();
    await expect(removeNominateOwnerTx).resolves.toBeReceipt();

    // Nomination should have been removed
    const getNominatedOwnerCall = dispatcher.getNominatedOwner();
    await expect(getNominatedOwnerCall).resolves.toBe(constants.AddressZero);

    // Ownership should not have changed
    const getOwnerCall = dispatcher.getOwner();
    await expect(getOwnerCall).resolves.toBe(await resolveAddress(deployer));

    // NominatedOwnerSet event properly emitted
    assertEvent(removeNominateOwnerTx, 'NominatedOwnerRemoved', {
      nominatedOwner: nextOwnerAddress,
    });
  });
});

describe('claimOwnership', () => {
  it('can only be called by the nominatedOwner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    const setNominatedOwnerTx = dispatcher.setNominatedOwner(randomAddress());
    await expect(setNominatedOwnerTx).resolves.toBeReceipt();

    // Attempt by a random user to claim ownership should fail
    const claimOwnershipTx = dispatcher.connect(randomUser).claimOwnership();
    await expect(claimOwnershipTx).rejects.toBeRevertedWith(
      'Only the nominatedOwner can call this function',
    );
  });

  it('correctly handles transferring ownership', async () => {
    const {
      accounts: { 0: nominatedOwner },
      config: { deployer },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    const nominatedOwnerAddress = await resolveAddress(nominatedOwner);
    const setNominatedOwnerTx = dispatcher.setNominatedOwner(
      nominatedOwnerAddress,
    );
    await expect(setNominatedOwnerTx).resolves.toBeReceipt();

    // Claim ownership
    const claimOwnershipTx = dispatcher
      .connect(nominatedOwner)
      .claimOwnership();
    await expect(claimOwnershipTx).resolves.toBeReceipt();

    // Owner should now be the nominatedOwner
    const getOwnerCall = dispatcher.getOwner();
    await expect(getOwnerCall).resolves.toBe(nominatedOwnerAddress);

    // nominatedOwner should be empty
    const getNominatedOwnerCall = dispatcher.getNominatedOwner();
    await expect(getNominatedOwnerCall).resolves.toBe(constants.AddressZero);

    // OwnershipTransferred event properly emitted
    assertEvent(claimOwnershipTx, 'OwnershipTransferred', {
      prevOwner: await resolveAddress(deployer),
      nextOwner: nominatedOwnerAddress,
    });
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
    const creatorCall = vaultProxy.getCreator();
    await expect(creatorCall).resolves.toBe(dispatcher.address);

    const accessorCall = vaultProxy.getAccessor();
    await expect(accessorCall).resolves.toBe(vaultAccessor);

    const migratorCall = vaultProxy.getMigrator();
    await expect(migratorCall).resolves.toBe(constants.AddressZero);

    const ownerCall = vaultProxy.getOwner();
    await expect(ownerCall).resolves.toBe(owner);

    const initializedCall = vaultProxy.getInitialized();
    await expect(initializedCall).resolves.toBe(true);

    // Assert ERC20 state
    const nameCall = vaultProxy.name();
    await expect(nameCall).resolves.toBe(fundName);

    const symbolCall = vaultProxy.symbol();
    await expect(symbolCall).resolves.toBe('MLNF');

    const decimalsCall = vaultProxy.decimals();
    await expect(decimalsCall).resolves.toBe(18);

    // TODO: Check VaultProxy events and ERC20 events
  });
});

describe('signalMigration', () => {
  it.todo('does not allow empty values');

  it.todo('does not allow non-existent VaultProxy');

  it.todo('cannot be called by a previous FundDeployer');

  it.todo('cannot be called if fund is already on the current FundDeployer');

  it('correctly handles preSignalMigrationOriginHook failure', async () => {
    const {
      deployment: { dispatcher },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshotWithMocks);

    // Unset preSignalMigrationOriginHook
    await mockPrevFundDeployer.preSignalMigrationOriginHook.reset();

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    // This should fail because of the missing hook implementation.
    const nextVaultAccessor = randomAddress();
    const failingTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    await expect(failingTx).rejects.toBeRevertedWith(
      'preSignalMigrationOriginHook failure',
    );

    // Bypassing the failure should allow the tx to succeed and fire the failure event
    const signalTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
      bypassFailure: true,
    });

    await expect(signalTx).resolves.toBeReceipt();
    await assertEvent(signalTx, 'PreSignalMigrationOriginHookFailed', {
      failureReturnData: expect.any(String),
      vaultProxy: vaultProxy.address,
      prevFundDeployer: mockPrevFundDeployer.address,
      nextFundDeployer: mockNextFundDeployer.address,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib.address,
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
    const signalTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    await expect(signalTx).resolves.toBeReceipt();
    const signalTimestamp = await transactionTimestamp(signalTx);

    await assertEvent(signalTx, 'MigrationSignaled', {
      vaultProxy: vaultProxy.address,
      prevFundDeployer: mockPrevFundDeployer.address,
      nextFundDeployer: mockNextFundDeployer.address,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib.address,
    });

    const detailsCall = dispatcher.getMigrationRequestDetailsForVaultProxy(
      vaultProxy,
    );

    await expect(detailsCall).resolves.toMatchObject({
      nextFundDeployer_: mockNextFundDeployer.address,
      nextVaultAccessor_: nextVaultAccessor,
      nextVaultLib_: nextVaultLib.address,
      signalTimestamp_: BigNumber.from(signalTimestamp),
    });

    // Calls pre- and post- hooks on the mockPrevFundDeployer
    await expect(
      mockPrevFundDeployer.preSignalMigrationOriginHook,
    ).toHaveBeenCalledOnContract();

    await expect(
      mockPrevFundDeployer.preSignalMigrationOriginHook,
    ).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    await expect(
      mockPrevFundDeployer.postSignalMigrationOriginHook,
    ).toHaveBeenCalledOnContract();

    await expect(
      mockPrevFundDeployer.postSignalMigrationOriginHook,
    ).toHaveBeenCalledOnContractWith(
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

  it.todo(
    'can only be called by the vaultProxy owner or migrator, or the FundDeployer in the migration request',
  );

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
    const signalTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    await expect(signalTx).resolves.toBeReceipt();
    const signalTimestamp = await transactionTimestamp(signalTx);

    // Cancel migration (as owner / deployer)
    const cancelTx = dispatcher.cancelMigration(vaultProxy, false);
    await assertEvent(cancelTx, 'MigrationCancelled', {
      vaultProxy: vaultProxy.address,
      prevFundDeployer: mockPrevFundDeployer.address,
      nextFundDeployer: mockNextFundDeployer.address,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib.address,
      signalTimestamp: BigNumber.from(signalTimestamp),
    });

    // Removes MigrationRequest
    const detailsCall = dispatcher.getMigrationRequestDetailsForVaultProxy(
      vaultProxy,
    );

    await expect(detailsCall).resolves.toMatchObject({
      nextFundDeployer_: constants.AddressZero,
      nextVaultAccessor_: constants.AddressZero,
      nextVaultLib_: constants.AddressZero,
      signalTimestamp_: BigNumber.from(0),
    });

    // Calls post- hooks on the mockPrevFundDeployer and mockNextFundDeployer
    await expect(
      mockPrevFundDeployer.postCancelMigrationOriginHook,
    ).toHaveBeenCalledOnContract();

    await expect(
      mockPrevFundDeployer.postCancelMigrationOriginHook,
    ).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp,
    );

    await expect(
      mockNextFundDeployer.postCancelMigrationTargetHook,
    ).toHaveBeenCalledOnContract();

    await expect(
      mockNextFundDeployer.postCancelMigrationTargetHook,
    ).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockPrevFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp,
    );
  });
});

describe('executeMigration', () => {
  it.todo('does not allow empty values');

  it.todo('does not allow non-existent migration request');

  it.todo(
    'can only be called by the target FundDeployer in the migration request',
  );

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
    const signalTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });
    await expect(signalTx).resolves.toBeReceipt();

    // Try to migrate immediately, which should fail
    const executeTx1 = mockNextFundDeployer.forward(
      dispatcher.executeMigration,
      vaultProxy,
      false,
    );
    await expect(executeTx1).rejects.toBeRevertedWith(
      'The migration timelock has not been met',
    );

    // Warp to 5 secs prior to the timelock expiry, which should also fail
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() - 5]);

    // Try to migrate again, which should fail
    const executeTx2 = mockNextFundDeployer.forward(
      dispatcher.executeMigration,
      vaultProxy,
      false,
    );
    await expect(executeTx2).rejects.toBeRevertedWith(
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
    const signalTx = signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    await expect(signalTx).resolves.toBeReceipt();
    const signalTimestamp = await transactionTimestamp(signalTx);

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Execute migration
    const executeTx = mockNextFundDeployer.forward(
      dispatcher.executeMigration,
      vaultProxy,
      false,
    );
    await expect(executeTx).resolves.toBeReceipt();

    await assertEvent(executeTx, 'MigrationExecuted', {
      vaultProxy: vaultProxy.address,
      prevFundDeployer: mockPrevFundDeployer.address,
      nextFundDeployer: mockNextFundDeployer.address,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib.address,
      signalTimestamp: BigNumber.from(signalTimestamp),
    });

    // Assert VaultProxy changes
    const vaultLibCall = vaultProxy.getVaultLib();
    await expect(vaultLibCall).resolves.toBe(nextVaultLib.address);

    const accessorCall = vaultProxy.getAccessor();
    await expect(accessorCall).resolves.toBe(nextVaultAccessor);

    // Removes MigrationRequest
    const detailsCall = dispatcher.getMigrationRequestDetailsForVaultProxy(
      vaultProxy,
    );
    await expect(detailsCall).resolves.toMatchObject({
      nextFundDeployer_: constants.AddressZero,
      nextVaultAccessor_: constants.AddressZero,
      nextVaultLib_: constants.AddressZero,
      signalTimestamp_: BigNumber.from(0),
    });

    // Calls pre- and post- hooks on the mockPrevFundDeployer
    await expect(
      mockPrevFundDeployer.preMigrateOriginHook,
    ).toHaveBeenCalledOnContract();
    await expect(
      mockPrevFundDeployer.preMigrateOriginHook,
    ).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp,
    );

    await expect(
      mockPrevFundDeployer.postMigrateOriginHook,
    ).toHaveBeenCalledOnContract();
    await expect(
      mockPrevFundDeployer.postMigrateOriginHook,
    ).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      signalTimestamp,
    );
  });
});

describe('setMigrationTimelock', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    const setMigrationTimelockTx = dispatcher
      .connect(randomUser)
      .setMigrationTimelock(randomAddress());
    await expect(setMigrationTimelockTx).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow the current migrationTimelock value', async () => {
    const {
      deployment: { dispatcher },
    } = await provider.snapshot(snapshot);

    const migrationTimelock = await dispatcher.getMigrationTimelock();

    const setMigrationTimelockTx = dispatcher.setMigrationTimelock(
      migrationTimelock,
    );
    await expect(setMigrationTimelockTx).rejects.toBeRevertedWith(
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
    const setMigrationTimelockTx = dispatcher.setMigrationTimelock(
      nextTimelock,
    );
    await expect(setMigrationTimelockTx).resolves.toBeReceipt();

    // migrationTimelock should have updated to the new value
    const getMigrationTimelockCall = dispatcher.getMigrationTimelock();
    await expect(getMigrationTimelockCall).resolves.toEqBigNumber(nextTimelock);

    // MigrationTimelockSet event properly emitted
    assertEvent(setMigrationTimelockTx, 'MigrationTimelockSet', {
      prevTimelock,
      nextTimelock,
    });
  });
});
