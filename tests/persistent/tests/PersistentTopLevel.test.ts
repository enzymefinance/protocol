import { constants, utils, BigNumber } from 'ethers';
import {
  BuidlerProvider,
  randomAddress,
  extractEvent,
  AddressLike,
  MockContract,
} from '@crestproject/crestproject';
import { defaultTestConfig, deployProtocol } from '../deployment';
import * as contracts from '../contracts';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const config = await defaultTestConfig(provider);
  const deployment = await deployProtocol(config);

  const mockVaultLib1 = await contracts.MockVaultLib.deploy(config.deployer);
  const mockVaultLib2 = await contracts.MockVaultLib.deploy(config.deployer);

  const mockRelease1 = await contracts.IMigrationHookHandler.mock(
    config.deployer,
  );
  const mockRelease2 = await contracts.IMigrationHookHandler.mock(
    config.deployer,
  );

  return {
    core: deployment,
    config,
    mockVaultLib1,
    mockVaultLib2,
    mockRelease1,
    mockRelease2,
  };
}

async function deployVault({
  provider,
  persistentTopLevel,
  mtc,
  mockRelease,
  vaultLib,
  owner = randomAddress(),
  accessor = randomAddress(),
  fundName = 'My Fund',
}: {
  provider: BuidlerProvider;
  persistentTopLevel: contracts.PersistentTopLevel;
  mtc: string;
  mockRelease: MockContract<contracts.IMigrationHookHandler>;
  vaultLib: AddressLike;
  owner?: AddressLike;
  accessor?: AddressLike;
  fundName?: string;
}) {
  // TODO: could check if release is already the current release
  await persistentTopLevel
    .connect(provider.getSigner(mtc))
    .setCurrentRelease(mockRelease);

  tx = await mockRelease.forward(
    persistentTopLevel.deployVaultProxy,
    vaultLib,
    owner,
    accessor,
    fundName,
  );

  const events = extractEvent(
    tx,
    persistentTopLevel.abi.getEvent('VaultProxyDeployed'),
  );
  const vaultProxy = new contracts.MockVaultLib(
    events[0].args.vaultProxy,
    provider,
  );

  return { vaultProxy, tx };
}

async function signalMigration({
  provider,
  persistentTopLevel,
  mtc,
  vaultProxy,
  mockNextRelease,
  nextVaultLib,
  nextAccessor = randomAddress(),
}: {
  provider: BuidlerProvider;
  persistentTopLevel: contracts.PersistentTopLevel;
  mtc: string;
  vaultProxy: contracts.MockVaultLib;
  mockNextRelease: MockContract<contracts.IMigrationHookHandler>;
  nextVaultLib: AddressLike;
  nextAccessor?: AddressLike;
}) {
  // TODO: could check if release is already the current release
  await persistentTopLevel
    .connect(provider.getSigner(mtc))
    .setCurrentRelease(mockNextRelease);

  tx = await mockNextRelease.forward(
    persistentTopLevel.signalMigration,
    vaultProxy,
    nextAccessor,
    nextVaultLib,
  );

  const signalMigrationTimestamp = (await provider.getBlock(tx.blockNumber))
    .timestamp;

  return { signalMigrationTimestamp, tx };
}

describe('PersistentTopLevel', () => {
  describe('constructor', () => {
    it('sets initial state', async () => {
      const {
        core: { persistentTopLevel },
        config: {
          owners: { mtc, mgm },
        },
      } = await provider.snapshot(snapshot);

      tx = persistentTopLevel.getMTC();
      await expect(tx).resolves.toBe(mtc);

      tx = persistentTopLevel.getMGM();
      await expect(tx).resolves.toBe(mgm);
    });
  });

  describe('deployVaultProxy', () => {
    it.todo('does not allow a bad VaultLib');

    it('correctly deploys a new VaultProxy', async () => {
      const {
        core: { persistentTopLevel },
        config: {
          owners: { mtc },
        },
        mockRelease1: mockRelease,
        mockVaultLib1: vaultLib,
      } = await provider.snapshot(snapshot);

      const owner = randomAddress();
      const accessor = randomAddress();
      const fundName = 'Mock Fund';

      const { vaultProxy, tx: vaultProxyDeployedTx } = await deployVault({
        provider,
        persistentTopLevel,
        mtc,
        mockRelease,
        vaultLib,
        owner,
        accessor,
        fundName,
      });

      // Assert event
      const events = extractEvent(
        vaultProxyDeployedTx,
        persistentTopLevel.abi.getEvent('VaultProxyDeployed'),
      );
      expect(events.length).toBe(1);
      const eventArgs = events[0].args;
      expect(eventArgs).toMatchObject({
        release: mockRelease.address,
        owner,
        vaultLib: vaultLib.address,
        accessor,
        fundName,
      });

      // Assert VaultLib state
      tx = vaultProxy.getCreator();
      await expect(tx).resolves.toBe(persistentTopLevel.address);

      tx = vaultProxy.getAccessor();
      await expect(tx).resolves.toBe(accessor);

      tx = vaultProxy.getOwner();
      await expect(tx).resolves.toBe(owner);

      tx = vaultProxy.getInitialized();
      await expect(tx).resolves.toBe(true);

      // Assert ERC20 state
      tx = vaultProxy.name();
      await expect(tx).resolves.toBe(fundName);

      tx = vaultProxy.symbol();
      await expect(tx).resolves.toBe('MLNF');

      tx = vaultProxy.decimals();
      await expect(tx).resolves.toBe(18);

      // TODO: Check VaultProxy events and ERC20 events
    });
  });

  describe('signalMigration', () => {
    it.todo('does not allow empty values');

    it.todo('does not allow non-existent VaultProxy');

    it.todo('cannot be called by a previous release');

    it.todo('cannot be called if fund is already on the current release');

    it.todo('fires proper failure events when the hooks do not succeed');

    it('correctly signals a migration', async () => {
      const {
        core: { persistentTopLevel },
        config: {
          owners: { mtc },
        },
        mockRelease1: mockPrevRelease,
        mockRelease2: mockNextRelease,
        mockVaultLib1: prevVaultLib,
        mockVaultLib2: nextVaultLib,
      } = await provider.snapshot(snapshot);

      // Deploy VaultProxy on mockPrevRelease
      const { vaultProxy } = await deployVault({
        provider,
        persistentTopLevel,
        mtc,
        mockRelease: mockPrevRelease,
        vaultLib: prevVaultLib,
      });

      // Change current release to mockNextRelease and signal migration
      const nextAccessor = randomAddress();
      const {
        signalMigrationTimestamp,
        tx: migrationSignaledTx,
      } = await signalMigration({
        provider,
        persistentTopLevel,
        mtc,
        mockNextRelease,
        nextVaultLib,
        vaultProxy,
        nextAccessor,
      });

      // Assert event
      const events = extractEvent(
        migrationSignaledTx,
        persistentTopLevel.abi.getEvent('MigrationSignaled'),
      );
      expect(events.length).toBe(1);
      const eventArgs = events[0].args;
      expect(eventArgs).toMatchObject({
        vaultProxy: vaultProxy.address,
        prevRelease: mockPrevRelease.address,
        nextRelease: mockNextRelease.address,
        nextAccessor,
        nextVaultLib: nextVaultLib.address,
      });

      // Creates MigrationRequest
      tx = await persistentTopLevel.getMigrationRequestDetailsForFund(
        vaultProxy,
      );
      expect(tx).toMatchObject({
        nextRelease_: mockNextRelease.address,
        nextAccessor_: nextAccessor,
        nextVaultLib_: nextVaultLib.address,
        signalTimestamp_: BigNumber.from(signalMigrationTimestamp),
      });

      // Calls pre- and post- hooks on the mockPrevRelease
      await expect(
        mockPrevRelease.preSignalMigrationOriginHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockPrevRelease.preSignalMigrationOriginHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockNextRelease,
        nextAccessor,
        nextVaultLib,
      );

      await expect(
        mockPrevRelease.postSignalMigrationOriginHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockPrevRelease.postSignalMigrationOriginHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockNextRelease,
        nextAccessor,
        nextVaultLib,
      );
    });
  });

  describe('cancelMigration', () => {
    it.todo('does not allow empty values');

    it.todo('does not allow non-existent migration request');

    it.todo(
      'can only be called by the vaultProxy owner, or the release in the migration request',
    );

    it.todo('fires proper failure events when the hooks do not succeed');

    it('correctly cancels a migration request', async () => {
      const {
        core: { persistentTopLevel },
        config: {
          deployer,
          owners: { mtc },
        },
        mockRelease1: mockPrevRelease,
        mockRelease2: mockNextRelease,
        mockVaultLib1: prevVaultLib,
        mockVaultLib2: nextVaultLib,
      } = await provider.snapshot(snapshot);

      // Deploy VaultProxy on mockPrevRelease
      const { vaultProxy } = await deployVault({
        provider,
        persistentTopLevel,
        mtc,
        mockRelease: mockPrevRelease,
        vaultLib: prevVaultLib,
        owner: deployer,
      });

      // Change current release to mockNextRelease and signal migration
      const nextAccessor = randomAddress();
      const { signalMigrationTimestamp } = await signalMigration({
        provider,
        persistentTopLevel,
        mtc,
        mockNextRelease,
        nextVaultLib,
        vaultProxy,
        nextAccessor,
      });

      // Cancel migration (as owner / deployer)
      tx = await persistentTopLevel.cancelMigration(vaultProxy);

      // Assert event
      const events = extractEvent(
        tx,
        persistentTopLevel.abi.getEvent('MigrationCancelled'),
      );
      expect(events.length).toBe(1);
      const cancellationEventArgs = events[0].args;
      expect({
        vaultProxy: cancellationEventArgs.vaultProxy,
        prevRelease: cancellationEventArgs.prevRelease,
        nextRelease: cancellationEventArgs.nextRelease,
        nextAccessor: cancellationEventArgs.nextAccessor,
        nextVaultLib: cancellationEventArgs.nextVaultLib,
        signalTimestamp: cancellationEventArgs.signalTimestamp,
      }).toMatchObject({
        vaultProxy: vaultProxy.address,
        prevRelease: mockPrevRelease.address,
        nextRelease: mockNextRelease.address,
        nextAccessor,
        nextVaultLib: nextVaultLib.address,
        signalTimestamp: BigNumber.from(signalMigrationTimestamp),
      });

      // Removes MigrationRequest
      tx = persistentTopLevel.fundHasMigrationRequest(vaultProxy);
      await expect(tx).resolves.toBe(false);

      tx = await persistentTopLevel.getMigrationRequestDetailsForFund(
        vaultProxy,
      );
      expect({
        nextRelease_: tx.nextRelease_,
        nextAccessor_: tx.nextAccessor_,
        nextVaultLib_: tx.nextVaultLib_,
        signalTimestamp_: tx.signalTimestamp_,
      }).toMatchObject({
        nextRelease_: constants.AddressZero,
        nextAccessor_: constants.AddressZero,
        nextVaultLib_: constants.AddressZero,
        signalTimestamp_: BigNumber.from(0),
      });

      // Calls post- hooks on the mockPrevRelease and mockNextRelease
      await expect(
        mockPrevRelease.postCancelMigrationOriginHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockPrevRelease.postCancelMigrationOriginHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockNextRelease,
        nextAccessor,
        nextVaultLib,
        signalMigrationTimestamp,
      );

      await expect(
        mockNextRelease.postCancelMigrationTargetHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockNextRelease.postCancelMigrationTargetHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockPrevRelease,
        nextAccessor,
        nextVaultLib,
        signalMigrationTimestamp,
      );
    });
  });

  describe('executeMigration', () => {
    it.todo('does not allow empty values');

    it.todo('does not allow non-existent migration request');

    it.todo(
      'can only be called by the target release in the migration request',
    );

    it.todo(
      'cannot be called when the target release in the migration request is no longer the current release',
    );

    it.todo('fires proper failure events when the hooks do not succeed');

    it('correctly executes a migration request', async () => {
      const {
        core: { persistentTopLevel },
        config: {
          deployer,
          owners: { mtc },
        },
        mockRelease1: mockPrevRelease,
        mockRelease2: mockNextRelease,
        mockVaultLib1: prevVaultLib,
        mockVaultLib2: nextVaultLib,
      } = await provider.snapshot(snapshot);

      // Deploy VaultProxy on mockPrevRelease
      const { vaultProxy } = await deployVault({
        provider,
        persistentTopLevel,
        mtc,
        mockRelease: mockPrevRelease,
        vaultLib: prevVaultLib,
        owner: deployer,
      });

      // Change current release to mockNextRelease and signal migration
      const nextAccessor = randomAddress();
      const { signalMigrationTimestamp } = await signalMigration({
        provider,
        persistentTopLevel,
        mtc,
        mockNextRelease,
        nextVaultLib,
        vaultProxy,
        nextAccessor,
      });

      // Execute migration
      tx = await mockNextRelease.forward(
        persistentTopLevel.executeMigration,
        vaultProxy,
      );

      // Assert event
      const events = extractEvent(
        tx,
        persistentTopLevel.abi.getEvent('MigrationExecuted'),
      );
      expect(events.length).toBe(1);
      const cancellationEventArgs = events[0].args;
      expect({
        vaultProxy: cancellationEventArgs.vaultProxy,
        prevRelease: cancellationEventArgs.prevRelease,
        nextRelease: cancellationEventArgs.nextRelease,
        nextAccessor: cancellationEventArgs.nextAccessor,
        nextVaultLib: cancellationEventArgs.nextVaultLib,
        signalTimestamp: cancellationEventArgs.signalTimestamp,
      }).toMatchObject({
        vaultProxy: vaultProxy.address,
        prevRelease: mockPrevRelease.address,
        nextRelease: mockNextRelease.address,
        nextAccessor,
        nextVaultLib: nextVaultLib.address,
        signalTimestamp: BigNumber.from(signalMigrationTimestamp),
      });

      // Assert VaultProxy changes
      tx = vaultProxy.getVaultLib();
      await expect(tx).resolves.toBe(nextVaultLib.address);

      tx = vaultProxy.getAccessor();
      await expect(tx).resolves.toBe(nextAccessor);

      // Removes MigrationRequest
      tx = persistentTopLevel.fundHasMigrationRequest(vaultProxy);
      await expect(tx).resolves.toBe(false);

      tx = await persistentTopLevel.getMigrationRequestDetailsForFund(
        vaultProxy,
      );
      expect({
        nextRelease_: tx.nextRelease_,
        nextAccessor_: tx.nextAccessor_,
        nextVaultLib_: tx.nextVaultLib_,
        signalTimestamp_: tx.signalTimestamp_,
      }).toMatchObject({
        nextRelease_: constants.AddressZero,
        nextAccessor_: constants.AddressZero,
        nextVaultLib_: constants.AddressZero,
        signalTimestamp_: BigNumber.from(0),
      });

      // Calls pre- and post- hooks on the mockPrevRelease
      await expect(
        mockPrevRelease.preMigrateOriginHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockPrevRelease.preMigrateOriginHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockNextRelease,
        nextAccessor,
        nextVaultLib,
        signalMigrationTimestamp,
      );

      await expect(
        mockPrevRelease.postMigrateOriginHook,
      ).toHaveBeenCalledOnContract();
      await expect(
        mockPrevRelease.postMigrateOriginHook,
      ).toHaveBeenCalledOnContractWith(
        vaultProxy,
        mockNextRelease,
        nextAccessor,
        nextVaultLib,
        signalMigrationTimestamp,
      );
    });
  });
});
