// TODO: All hooks are currently unimplemented and thus failing

import { constants, BigNumber } from 'ethers';
import {
  BuidlerProvider,
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

async function snapshot(provider: BuidlerProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

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
    deployment,
    config,
    mockVaultLib1,
    mockVaultLib2,
    mockFundDeployer1,
    mockFundDeployer2,
  };
}

async function ensureFundDeployer({
  dispatcher,
  mtc,
  fundDeployer,
}: {
  dispatcher: Dispatcher;
  mtc: string;
  fundDeployer: AddressLike;
}) {
  const currentDeployer = await dispatcher.getCurrentFundDeployer();
  const nextDeployerAddress = await resolveAddress(fundDeployer);
  if (currentDeployer != nextDeployerAddress) {
    const mtcDispatcher = dispatcher.connect(provider.getSigner(mtc));
    const fundDeployerTx = mtcDispatcher.setCurrentFundDeployer(
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
  mtc,
  mockFundDeployer,
  vaultLib,
  owner = randomAddress(),
  vaultAccessor = randomAddress(),
  fundName = 'My Fund',
}: {
  dispatcher: Dispatcher;
  mtc: string;
  mockFundDeployer: MockContract<IMigrationHookHandler>;
  vaultLib: AddressLike;
  owner?: AddressLike;
  vaultAccessor?: AddressLike;
  fundName?: string;
}) {
  await ensureFundDeployer({ dispatcher, mtc, fundDeployer: mockFundDeployer });

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
  mtc,
  vaultProxy,
  mockNextFundDeployer,
  nextVaultLib,
  nextVaultAccessor = randomAddress(),
  bypassFailure = false,
}: {
  dispatcher: Dispatcher;
  mtc: string;
  vaultProxy: MockVaultLib;
  mockNextFundDeployer: MockContract<IMigrationHookHandler>;
  nextVaultLib: AddressLike;
  nextVaultAccessor?: AddressLike;
  bypassFailure?: boolean;
}) {
  await ensureFundDeployer({
    dispatcher,
    mtc,
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
      config: { mtc, mgm },
    } = await provider.snapshot(snapshot);

    const mtcCall = dispatcher.getMTC();
    await expect(mtcCall).resolves.toBe(mtc);

    const mgmCall = dispatcher.getMGM();
    await expect(mgmCall).resolves.toBe(mgm);
  });
});

describe('deployVaultProxy', () => {
  it.todo('does not allow a bad VaultLib');

  it('correctly deploys a new VaultProxy', async () => {
    const {
      deployment: { dispatcher },
      config: { mtc },
      mockFundDeployer1: mockFundDeployer,
      mockVaultLib1: vaultLib,
    } = await provider.snapshot(snapshot);

    const owner = randomAddress();
    const vaultAccessor = randomAddress();
    const fundName = 'Mock Fund';
    const vaultProxy = await deployVault({
      dispatcher,
      mtc,
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
      config: { mtc },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Unset preSignalMigrationOriginHook
    await mockPrevFundDeployer.preSignalMigrationOriginHook.reset();

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mtc,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    // This should fail because of the missing hook implementation.
    const nextVaultAccessor = randomAddress();
    const failingTx = signalMigration({
      dispatcher,
      mtc,
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
      mtc,
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
      config: { mtc },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mtc,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const signalTx = signalMigration({
      dispatcher,
      mtc,
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

    const detailsCall = dispatcher.getMigrationRequestDetailsForFund(
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
      config: { deployer, mtc },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mtc,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const signalTx = signalMigration({
      dispatcher,
      mtc,
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
    const detailsCall = dispatcher.getMigrationRequestDetailsForFund(
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

  it.todo('correctly handles preMigrateOriginHook failure');

  it.todo('correctly handles postMigrateOriginHook failure');

  it('correctly executes a migration request', async () => {
    const {
      deployment: { dispatcher },
      config: { deployer, mtc },
      mockFundDeployer1: mockPrevFundDeployer,
      mockFundDeployer2: mockNextFundDeployer,
      mockVaultLib1: prevVaultLib,
      mockVaultLib2: nextVaultLib,
    } = await provider.snapshot(snapshot);

    // Deploy VaultProxy on mockPrevFundDeployer
    const vaultProxy = await deployVault({
      dispatcher,
      mtc,
      mockFundDeployer: mockPrevFundDeployer,
      vaultLib: prevVaultLib,
      owner: deployer,
    });

    // Change current FundDeployer to mockNextFundDeployer and signal migration
    const nextVaultAccessor = randomAddress();
    const signalTx = signalMigration({
      dispatcher,
      mtc,
      mockNextFundDeployer,
      nextVaultLib,
      vaultProxy,
      nextVaultAccessor,
    });

    await expect(signalTx).resolves.toBeReceipt();
    const signalTimestamp = await transactionTimestamp(signalTx);

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
    const detailsCall = dispatcher.getMigrationRequestDetailsForFund(
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
