import { AddressLike, MockContract, randomAddress, sameAddress } from '@enzymefinance/ethers';
import { Dispatcher, IMigrationHookHandler, MigrationOutHook, MockVaultLib } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, transactionTimestamp } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

async function snapshot() {
  const {
    accounts,
    deployer,
    deployment: { dispatcher },
  } = await deployProtocolFixture();

  const mockVaultLib1 = await MockVaultLib.deploy(deployer);
  const mockVaultLib2 = await MockVaultLib.deploy(deployer);

  // It doesn't matter what interfaces these have, they are only needed for asserting non-contract
  const dummyContract1 = await MockVaultLib.deploy(deployer);
  const dummyContract2 = await MockVaultLib.deploy(deployer);

  // Create mock FundDeployer instances with hooks implemented.
  // We can unset hooks in individual tests to test failure behavior.
  const mockFundDeployer1 = await IMigrationHookHandler.mock(deployer);
  await mockFundDeployer1.invokeMigrationOutHook.returns(undefined);

  const mockFundDeployer2 = await IMigrationHookHandler.mock(deployer);
  await mockFundDeployer2.invokeMigrationInCancelHook.returns(undefined);

  return {
    accounts,
    deployer,
    dispatcher,
    dummyContract1,
    dummyContract2,
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
  vaultAccessor,
  vaultLib,
  owner = randomAddress(),
  fundName = 'My Fund',
}: {
  dispatcher: Dispatcher;
  mockFundDeployer: MockContract<IMigrationHookHandler>;
  vaultAccessor: AddressLike;
  vaultLib: AddressLike;
  owner?: AddressLike;
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
    vaultProxy: expect.anything(),
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
    const { dispatcher, deployer } = await provider.snapshot(snapshot);

    const getOwnerCall = await dispatcher.getOwner();
    expect(getOwnerCall).toMatchAddress(deployer);

    const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    // const getCurrentFundDeployerCall = await dispatcher.getCurrentFundDeployer();
    // expect(getCurrentFundDeployerCall).toMatchAddress(constants.AddressZero);
  });
});

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const {
      accounts: [randomUser],
      dispatcher,
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.connect(randomUser).setNominatedOwner(randomAddress())).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    await expect(dispatcher.setNominatedOwner(constants.AddressZero)).rejects.toBeRevertedWith(
      '_nextNominatedOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const { dispatcher, deployer: currentOwner } = await provider.snapshot(snapshot);

    await expect(dispatcher.setNominatedOwner(currentOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already the owner',
    );
  });

  it('does not allow the next owner to already be nominated', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Nominate the nextOwner a first time
    const nextOwner = randomAddress();
    await dispatcher.setNominatedOwner(nextOwner);

    // Attempt to nominate the same nextOwner a second time
    await expect(dispatcher.setNominatedOwner(nextOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const { deployer, dispatcher } = await provider.snapshot(snapshot);

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
      dispatcher,
    } = await provider.snapshot(snapshot);

    // Set nominated owner
    await dispatcher.setNominatedOwner(randomAddress());

    // Attempt by a random user to remove nominated owner should fail
    await expect(dispatcher.connect(randomUser).removeNominatedOwner()).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('correctly handles removing the nomination', async () => {
    const { deployer, dispatcher } = await provider.snapshot(snapshot);

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
      dispatcher,
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
      deployer,
      dispatcher,
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
  it('does not allow a bad VaultLib', async () => {
    const { dispatcher, dummyContract1: vaultAccessor, mockFundDeployer1 } = await provider.snapshot(snapshot);

    const owner = randomAddress();
    const fundName = 'Mock Fund';

    // Setting a bad vaultLib
    const EOAVaultLib = randomAddress();

    // Set a fund deployer to call deployVaultProxy
    await dispatcher.setCurrentFundDeployer(mockFundDeployer1);

    // Attempt to deployVaultProxy with bad vaultLib
    await expect(
      mockFundDeployer1.forward(dispatcher.deployVaultProxy, EOAVaultLib, owner, vaultAccessor, fundName),
    ).rejects.toBeReverted();
  });

  it('does not allow a non-contract _vaultAccessor', async () => {
    const { dispatcher, mockFundDeployer1, mockVaultLib1 } = await provider.snapshot(snapshot);

    const owner = randomAddress();
    const EOAVaultAccessor = randomAddress();
    const fundName = 'Mock Fund';

    // Set a fund deployer to call deployVaultProxy
    await dispatcher.setCurrentFundDeployer(mockFundDeployer1);

    // Attempt to deployVaultProxy with bad vaultLib
    await expect(
      mockFundDeployer1.forward(dispatcher.deployVaultProxy, mockVaultLib1, owner, EOAVaultAccessor, fundName),
    ).rejects.toBeRevertedWith('Non-contract _vaultAccessor');
  });

  it('correctly deploys a new VaultProxy', async () => {
    const {
      dispatcher,
      dummyContract1: vaultAccessor,
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    const owner = randomAddress();
    const fundName = 'Mock Fund';

    // Set current fund deployer
    await dispatcher.setCurrentFundDeployer(mockFundDeployer);

    // Deploy vault proxy
    const receipt = await mockFundDeployer.forward(
      dispatcher.deployVaultProxy,
      vaultLib,
      owner,
      vaultAccessor,
      fundName,
    );

    const event = dispatcher.abi.getEvent('VaultProxyDeployed');
    const args = assertEvent(receipt, event, {
      fundName,
      owner,
      vaultAccessor,
      vaultLib,
      fundDeployer: mockFundDeployer,
      vaultProxy: expect.anything(),
    });

    // Create the Vault proxy object
    const vaultProxy = new MockVaultLib(args.vaultProxy, provider);

    // Assert VaultLib state
    const creatorCall = await vaultProxy.getCreator();
    expect(creatorCall).toMatchAddress(dispatcher);

    const accessorCall = await vaultProxy.getAccessor();
    expect(accessorCall).toMatchAddress(vaultAccessor);

    const migratorCall = await vaultProxy.getMigrator();
    expect(migratorCall).toMatchAddress(constants.AddressZero);

    const ownerCall = await vaultProxy.getOwner();
    expect(ownerCall).toMatchAddress(owner);

    const fundDeployerForVaultProxy = await dispatcher.getFundDeployerForVaultProxy(vaultProxy);
    expect(fundDeployerForVaultProxy).toMatchAddress(mockFundDeployer);

    // Assert ERC20 state
    const nameCall = await vaultProxy.name();
    expect(nameCall).toBe(fundName);

    // The symbol is empty by default in VaultBaseCore
    const symbolCall = await vaultProxy.symbol();
    expect(symbolCall).toBe('');

    const decimalsCall = await vaultProxy.decimals();
    expect(decimalsCall).toBe(18);

    // Assert vaultProxy events
    const accessorSetEvent = vaultProxy.abi.getEvent('AccessorSet');
    assertEvent(receipt, accessorSetEvent, { prevAccessor: constants.AddressZero, nextAccessor: vaultAccessor });

    const ownerSetEvent = vaultProxy.abi.getEvent('OwnerSet');
    assertEvent(receipt, ownerSetEvent, { prevOwner: constants.AddressZero, nextOwner: owner });

    const vaultLibSetEvent = vaultProxy.abi.getEvent('VaultLibSet');
    assertEvent(receipt, vaultLibSetEvent, { prevVaultLib: constants.AddressZero, nextVaultLib: vaultLib });
  });
});

describe('signalMigration', () => {
  it('can only be called by the current fund deployer', async () => {
    const {
      accounts: [randomAccount],
      dispatcher,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Set current fund deployer
    await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Attempt to signal migration as random account
    await expect(
      dispatcher.connect(randomAccount).signalMigration(vaultProxy, nextVaultAccessor, nextVaultLib, false),
    ).rejects.toBeRevertedWith('Only the current FundDeployer can call this function');
  });

  it('does not allow a non-contract _vaultAccessor', async () => {
    const {
      dispatcher,
      dummyContract1: prevVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Set new fund deployer
    await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Attempt to deployVaultProxy with bad vaultLib
    await expect(
      mockNextFundDeployer.forward(dispatcher.signalMigration, vaultProxy, randomAddress(), nextVaultLib, false),
    ).rejects.toBeRevertedWith('Non-contract _nextVaultAccessor');
  });

  it('does not allow non-existent VaultProxy', async () => {
    const {
      dispatcher,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Set vaultProxy to a random address
    const vaultProxy = randomAddress();

    // Set current fund deployer
    await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Attempt to signal migration for the random vaultProxy address
    await expect(
      mockNextFundDeployer.forward(dispatcher.signalMigration, vaultProxy, nextVaultAccessor, nextVaultLib, false),
    ).rejects.toBeRevertedWith('_vaultProxy does not exist');
  });

  it('cannot be called if fund is already on the current FundDeployer', async () => {
    const {
      dispatcher,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Confirm that fundDeployer is mockPrevFundDeployer
    const currentFundDeployer = await dispatcher.getCurrentFundDeployer();
    expect(currentFundDeployer).toMatchAddress(mockPrevFundDeployer);

    // Attempt to call a migration from the prevFundDeployer
    const signalMigrationCall = mockPrevFundDeployer.forward(
      dispatcher.signalMigration,
      vaultProxy,
      nextVaultAccessor,
      nextVaultLib,
      false,
    );

    await expect(signalMigrationCall).rejects.toBeRevertedWith('Can only migrate to a new FundDeployer');
  });

  it('correctly handles MigrationOutHook.PreSignal failure', async () => {
    const {
      dispatcher,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Make MigrationOutHook invoke fail
    const revertReason = 'test revert';
    // TODO: revert specifically for MigrationOutHook.PreSignal
    await mockPrevFundDeployer.invokeMigrationOutHook
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
      failureReturnData: expect.anything(),
      hook: MigrationOutHook.PreSignal,
      vaultProxy: vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib,
    });
  });

  it('correctly handles postSignalMigrationOriginHook failure', async () => {
    const {
      dispatcher,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Make MigrationOutHook invoke fail
    const revertReason = 'test revert';
    // TODO: revert specifically for MigrationOutHook.PostSignal
    await mockPrevFundDeployer.invokeMigrationOutHook
      .given(MigrationOutHook.PostSignal, vaultProxy, mockNextFundDeployer, nextVaultAccessor, nextVaultLib)
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
      failureReturnData: expect.anything(),
      hook: MigrationOutHook.PostSignal,
      vaultProxy: vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib: nextVaultLib,
    });
  });

  it('correctly signals a migration', async () => {
    const {
      dispatcher,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const receipt = await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Calculate the timestamp at which the request will be executable
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    const executableTimestamp = migrationTimelock.add(await transactionTimestamp(receipt));

    assertEvent(receipt, 'MigrationSignaled', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
      executableTimestamp,
    });

    const detailsCall = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    expect(detailsCall).toMatchFunctionOutput(dispatcher.getMigrationRequestDetailsForVaultProxy, {
      nextFundDeployer_: mockNextFundDeployer,
      nextVaultAccessor_: nextVaultAccessor,
      nextVaultLib_: nextVaultLib,
      executableTimestamp_: executableTimestamp,
    });

    expect(mockPrevFundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockPrevFundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PostSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );
  });
});

describe('cancelMigration', () => {
  it('does not allow non-existent migration request', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy a VaultProxy
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib,
      owner: deployer,
    });

    // Attempt to cancel non-existent migration request
    const cancelMigrationCall = dispatcher.cancelMigration(vaultProxy, false);
    await expect(cancelMigrationCall).rejects.toBeRevertedWith('No migration request exists');
  });

  it('can not be called by an account other the vaultProxy owner or migrator, or the FundDeployer in the migration request', async () => {
    const {
      accounts: [randomAccount],
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Attempt to cancel migration as random account
    const cancelMigrationCall = dispatcher.connect(randomAccount).cancelMigration(vaultProxy, false);
    await expect(cancelMigrationCall).rejects.toBeRevertedWith('Not an allowed caller');
  });

  it.todo('correctly handles postCancelMigrationOriginHook failure');

  it.todo('correctly handles postCancelMigrationTargetHook failure');

  it('correctly cancels a migration request', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    const migrationRequestDetails = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    // Cancel migration (as owner / deployer)
    const cancelReceipt = await dispatcher.cancelMigration(vaultProxy, false);
    assertEvent(cancelReceipt, 'MigrationCancelled', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: migrationRequestDetails.nextFundDeployer_,
      nextVaultAccessor: migrationRequestDetails.nextVaultAccessor_,
      nextVaultLib: migrationRequestDetails.nextVaultLib_,
      executableTimestamp: migrationRequestDetails.executableTimestamp_,
    });

    expect(await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy)).toMatchFunctionOutput(
      dispatcher.getMigrationRequestDetailsForVaultProxy,
      {
        nextFundDeployer_: constants.AddressZero,
        nextVaultAccessor_: constants.AddressZero,
        nextVaultLib_: constants.AddressZero,
        executableTimestamp_: BigNumber.from(0),
      },
    );

    expect(mockPrevFundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreSignal,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockNextFundDeployer.invokeMigrationInCancelHook).toHaveBeenCalledOnContractWith(
      vaultProxy,
      mockPrevFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );
  });
});

describe('executeMigration', () => {
  it('does not allow a bad vaultLib', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Set a bad next vault lib
    const nextVaultLib = randomAddress();

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Execute migration
    const executeMigrationCall = mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);
    await expect(executeMigrationCall).rejects.toBeReverted();
  });

  it('does not allow non-existent migration request', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Attempt to execute migration for vaultProxy without signaled migration
    const executeMigrationCall = mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);
    await expect(executeMigrationCall).rejects.toBeRevertedWith('No migration request exists for _vaultProxy');
  });

  it('can only be called by the target FundDeployer in the migration request', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Attempt to execute migration from the previous fund deployer
    const executeMigrationCall = mockPrevFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);
    await expect(executeMigrationCall).rejects.toBeRevertedWith('Only the target FundDeployer can call this function');
  });

  it('cannot be called when the target FundDeployer in the migration request is no longer the current FundDeployer', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Set the currentFundDeployer to a new address
    await dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

    // Attempt to execute migration from the previous fund deployer
    const executeMigrationCall = mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);
    await expect(executeMigrationCall).rejects.toBeRevertedWith(
      'The target FundDeployer is no longer the current FundDeployer',
    );
  });

  it('cannot be called when the migration timelock has not yet been met', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Try to migrate immediately, which should fail
    await expect(mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false)).rejects.toBeRevertedWith(
      'The migration timelock has not elapsed',
    );

    // Warp to 5 secs prior to the timelock expiry, which should also fail
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() - 5]);

    // Try to migrate again, which should fail
    await expect(mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false)).rejects.toBeRevertedWith(
      'The migration timelock has not elapsed',
    );
  });

  it.todo('correctly handles preMigrateOriginHook failure');

  it.todo('correctly handles postMigrateOriginHook failure');

  it('correctly executes a migration request', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    const migrationRequestDetails = await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

    // Warp to exactly the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Execute migration
    const executeReceipt = await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

    assertEvent(executeReceipt, 'MigrationExecuted', {
      vaultProxy,
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: migrationRequestDetails.nextFundDeployer_,
      nextVaultAccessor: migrationRequestDetails.nextVaultAccessor_,
      nextVaultLib: migrationRequestDetails.nextVaultLib_,
      executableTimestamp: migrationRequestDetails.executableTimestamp_,
    });

    // Assert VaultProxy changes
    const vaultLibCall = await vaultProxy.getVaultLib();
    expect(vaultLibCall).toMatchAddress(nextVaultLib);

    const accessorCall = await vaultProxy.getAccessor();
    expect(accessorCall).toMatchAddress(nextVaultAccessor);

    // Removes MigrationRequest
    expect(await dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy)).toMatchFunctionOutput(
      dispatcher.getMigrationRequestDetailsForVaultProxy,
      {
        nextFundDeployer_: constants.AddressZero,
        nextVaultAccessor_: constants.AddressZero,
        nextVaultLib_: constants.AddressZero,
        executableTimestamp_: BigNumber.from(0),
      },
    );

    expect(mockPrevFundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
      MigrationOutHook.PreMigrate,
      vaultProxy,
      mockNextFundDeployer,
      nextVaultAccessor,
      nextVaultLib,
    );

    expect(mockPrevFundDeployer.invokeMigrationOutHook).toHaveBeenCalledOnContractWith(
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
      dispatcher,
    } = await provider.snapshot(snapshot);

    await expect(dispatcher.connect(randomUser).setMigrationTimelock(randomAddress())).rejects.toBeRevertedWith(
      'Only the contract owner can call this function',
    );
  });

  it('does not allow the current migrationTimelock value', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    const migrationTimelock = await dispatcher.getMigrationTimelock();

    await expect(dispatcher.setMigrationTimelock(migrationTimelock)).rejects.toBeRevertedWith(
      '_nextTimelock is the current timelock',
    );
  });

  it('correctly handles setting a new migration timelock', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

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

describe('getTimelockRemainingForMigrationRequest', () => {
  it('returns 0 if vaultProxy is not valid', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Call getTimelockRemainingForMigrationRequest for a random address (not a vaultProxy)
    const getMigrationTimelockCall = await dispatcher.getTimelockRemainingForMigrationRequest(randomAddress());
    expect(getMigrationTimelockCall).toEqBigNumber(0);
  });

  it('returns 0 if vaultProxy does not have a signaled migration', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: vaultAccessor,
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer,
      vaultAccessor,
      vaultLib,
      owner: deployer,
    });

    // Call getTimelockRemainingForMigrationRequest for a vaultProxy without migration request
    const getMigrationTimelockCall = await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy);
    expect(getMigrationTimelockCall).toEqBigNumber(0);
  });

  it('returns 0 if block timestamp >= executableTimestamp', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp past the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() + 1000]);
    // Mine a block after that time delay
    await provider.send('evm_mine', []);

    // Get migration TimeLock
    const getMigrationTimelockCall = await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy);
    expect(getMigrationTimelockCall).toEqBigNumber(0);
  });

  it('returns the remaining time if block timestamp < executableTimestamp', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Get timestamp of migration call
    const signalTimestamp = (await provider.getBlock('latest')).timestamp;

    // Warp to rough 10 seconds before the timelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() - 10]);
    // Mine a block after that time delay
    await provider.send('evm_mine', []);

    // Calculate the expected time remaining given the latest block
    const currentTimestamp = (await provider.getBlock('latest')).timestamp;
    const secondsElapsed = BigNumber.from(currentTimestamp).sub(signalTimestamp);
    const expectedTimeRemaining = migrationTimelock.sub(secondsElapsed);

    // Get migration TimeLock
    const getMigrationTimelockCall = await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy);
    expect(getMigrationTimelockCall).toEqBigNumber(expectedTimeRemaining);
  });
});

describe('hasExecutableMigrationRequest', () => {
  it('returns false if vaultProxy is not valid', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Call hasExecutableMigrationRequest for a random address (not a vaultProxy)
    const getMigrationTimelockCall = await dispatcher.hasExecutableMigrationRequest(randomAddress());
    expect(getMigrationTimelockCall).toBe(false);
  });
  it('returns false if no migration has been signaled', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: vaultAccessor,
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer,
      vaultAccessor,
      vaultLib,
      owner: deployer,
    });

    // Call hasExecutableMigrationRequest for a vaultProxy without migration request
    const hasExecutableMigrationRequestCall = await dispatcher.hasExecutableMigrationRequest(vaultProxy);
    expect(hasExecutableMigrationRequestCall).toBe(false);
  });

  it('returns false if elapsedTime < migrationTimelock', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp 5 seconds before the migrationTimelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() - 5]);
    // Mine a block after that time delay
    await provider.send('evm_mine', []);

    // Call hasExecutableMigrationRequest
    const hasExecutableMigrationRequestCall = await dispatcher.hasExecutableMigrationRequest(vaultProxy);
    expect(hasExecutableMigrationRequestCall).toBe(false);
  });

  it('returns true if elapsedTime >= migrationTimelock', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Warp past the migrationTimelock expiry
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber() + 1000]);
    // Mine a block after that time delay
    await provider.send('evm_mine', []);

    // Call hasExecutableMigrationRequest
    const hasExecutableMigrationRequestCall = await dispatcher.hasExecutableMigrationRequest(vaultProxy);
    expect(hasExecutableMigrationRequestCall).toBe(true);
  });
});

describe('hasMigrationRequest', () => {
  it('returns false if vaultProxy is not valid', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Call hasMigrationRequest for a random address (not a vaultProxy)
    const hasMigrationRequestCall = await dispatcher.hasMigrationRequest(randomAddress());
    expect(hasMigrationRequestCall).toBe(false);
  });

  it('returns false if no migration has been signaled', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: vaultAccessor,
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer,
      vaultAccessor,
      vaultLib,
      owner: deployer,
    });

    // Call hasExecutableMigrationRequest for a vaultProxy without migration request
    const hasMigrationRequestCall = await dispatcher.hasMigrationRequest(vaultProxy);
    expect(hasMigrationRequestCall).toBe(false);
  });

  it('returns true if a migration has been signaled', async () => {
    const {
      dispatcher,
      deployer,
      dummyContract1: prevVaultAccessor,
      dummyContract2: nextVaultAccessor,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mockFundDeployer: mockPrevFundDeployer,
      vaultAccessor: prevVaultAccessor,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Signal migration
    await signalMigration({
      dispatcher,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    // Call hasMigrationRequest
    const hasMigrationRequestCall = await dispatcher.hasMigrationRequest(vaultProxy);
    expect(hasMigrationRequestCall).toBe(true);
  });
});

describe('setCurrentFundDeployer', () => {
  it('disallows calling with account other than owner', async () => {
    const {
      accounts: [randomAccount],
      deployer,
      dispatcher,
    } = await provider.snapshot(snapshot);

    // Attempt to set a fund deployer with a non-owner account
    const setCurrentFundDeployerCall = dispatcher.connect(randomAccount).setCurrentFundDeployer(deployer);
    expect(setCurrentFundDeployerCall).rejects.toBeRevertedWith('Only the contract owner can call this function');
  });

  it('disallows empty address as nextFundDeployer', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Attempt to set a fund deployer with a non-owner account
    const setCurrentFundDeployerCall = dispatcher.setCurrentFundDeployer(constants.AddressZero);
    expect(setCurrentFundDeployerCall).rejects.toBeRevertedWith('_nextFundDeployer cannot be empty');
  });

  it("nextFundDeployer can't be the same as currentFundDeployer", async () => {
    const { dispatcher, mockFundDeployer1: mockPrevFundDeployer } = await provider.snapshot(snapshot);

    // Setting the current fund deployer a first time
    await dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

    const currentDeployer = await dispatcher.getCurrentFundDeployer();
    expect(currentDeployer).toMatchAddress(mockPrevFundDeployer);

    // Attempting to set it again with the same address
    const setCurrentFundDeployerCall = dispatcher.setCurrentFundDeployer(currentDeployer);
    await expect(setCurrentFundDeployerCall).rejects.toBeRevertedWith(
      '_nextFundDeployer is already currentFundDeployer',
    );
  });

  it('does not allow _nextFundDeployer to be a non-contract', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    await expect(dispatcher.setCurrentFundDeployer(randomAddress())).rejects.toBeRevertedWith(
      'Non-contract _nextFundDeployer',
    );
  });

  it('correctly sets new current fund deployer and emits CurrentFundDeployerSet event', async () => {
    const {
      dispatcher,
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
    } = await provider.snapshot(snapshot);

    // Set the initial fund deployer
    await dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

    // Checking that the fund deployer has been set
    const initialFundDeployer = await dispatcher.getCurrentFundDeployer();
    expect(initialFundDeployer).toMatchAddress(mockPrevFundDeployer);

    // Setting the initial fund deployer
    const receipt = await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Checking that the fund deployer has been updated
    const updatedFundDeployer = await dispatcher.getCurrentFundDeployer();
    expect(updatedFundDeployer).toMatchAddress(mockNextFundDeployer);

    // Checking that the proper event has been emitted
    const currentFundDeployerSetEvent = dispatcher.abi.getEvent('CurrentFundDeployerSet');
    assertEvent(receipt, currentFundDeployerSetEvent, {
      prevFundDeployer: mockPrevFundDeployer,
      nextFundDeployer: mockNextFundDeployer,
    });
  });
});

describe('setSharesTokenSymbol', () => {
  it('disallows a call by a random user', async () => {
    const {
      accounts: [randomAccount],
      dispatcher,
    } = await provider.snapshot(snapshot);

    // Attempt to setSharesTokenSymbol with random account
    const setSharesTokenSymbolCall = dispatcher.connect(randomAccount).setSharesTokenSymbol('TEST');
    await expect(setSharesTokenSymbolCall).rejects.toBeRevertedWith('Only the contract owner can call this function');
  });

  it('correctly updates the SharesTokenSymbol and emits event', async () => {
    const { dispatcher } = await provider.snapshot(snapshot);

    // Call setSharesTokenSymbol
    const receipt = await dispatcher.setSharesTokenSymbol('TEST');
    const getSharesTokenSymbolCall = await dispatcher.getSharesTokenSymbol();
    expect(getSharesTokenSymbolCall).toBe('TEST');

    const setSharesTokenSymbolEvent = dispatcher.abi.getEvent('SharesTokenSymbolSet');
    assertEvent(receipt, setSharesTokenSymbolEvent, { _nextSymbol: 'TEST' });
  });
});
