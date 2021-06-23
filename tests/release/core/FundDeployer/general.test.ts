import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { FundDeployer, ReleaseStatusTypes, sighash, vaultCallAnyDataHash } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state', async () => {
    const { fundDeployer, vaultLib, dispatcher } = fork.deployment;

    const getCreatorCall = await fundDeployer.getCreator();
    expect(getCreatorCall).toMatchAddress(fork.deployer);

    const getDispatcherCall = await fundDeployer.getDispatcher();
    expect(getDispatcherCall).toMatchAddress(dispatcher);

    const getOwnerCall = await fundDeployer.getOwner();
    expect(getOwnerCall).toMatchAddress(fork.deployer);

    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.Live);

    const getVaultLibCall = await fundDeployer.getVaultLib();
    expect(getVaultLibCall).toMatchAddress(vaultLib);

    for (const [contract, selector, dataHash] of fork.config.vaultCalls) {
      expect(await fundDeployer.isRegisteredVaultCall(contract, selector, dataHash)).toBe(true);
    }
  });
});

describe('setComptrollerLib', () => {
  it.todo('emits ControllerLibSet event');

  it('is set during deployment and can only be set once', async () => {
    const { fundDeployer, comptrollerLib } = fork.deployment;

    const comptrollerLibCall = await fundDeployer.getComptrollerLib();
    expect(comptrollerLibCall).toMatchAddress(comptrollerLib);

    await expect(fundDeployer.setComptrollerLib(randomAddress())).rejects.toBeRevertedWith(
      'This value can only be set once',
    );
  });
});

describe('setReleaseStatus', () => {
  it.todo('can only be called by the Dispatcher contract owner');

  it.todo('does not allow returning to PreLaunch status');

  it.todo('does not allow the current status');

  it('cannot be called before comptrollerLib is set', async () => {
    const fundDeployer = await FundDeployer.deploy(fork.deployer, fork.deployment.dispatcher, fork.deployment.vaultLib);

    await expect(fundDeployer.setReleaseStatus(ReleaseStatusTypes.Live)).rejects.toBeRevertedWith(
      'Can only set the release status when comptrollerLib is set',
    );
  });

  it('correctly handles setting the release status', async () => {
    const { fundDeployer } = fork.deployment;
    const receipt = await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    // ReleaseStatusSet event is emitted
    assertEvent(receipt, 'ReleaseStatusSet', {
      prevStatus: ReleaseStatusTypes.Live,
      nextStatus: ReleaseStatusTypes.Paused,
    });

    // Release Status should be Paused
    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.Paused);
  });
});

describe('getOwner', () => {
  it.todo('write tests for special ownership conditions of this contract');
});

describe('vault call registry', () => {
  describe('isAllowedVaultCall', () => {
    it('returns true for any dataHash if the ANY_VAULT_CALL wildcard flag is registered', async () => {
      const { fundDeployer } = fork.deployment;

      const contract = randomAddress();
      const selector = sighash(utils.FunctionFragment.fromString('myTestFunction1(address)'));

      await fundDeployer.registerVaultCalls([contract], [selector], [vaultCallAnyDataHash]);

      // A vault call with a random data hash should not be registered, but should be allowed
      const randomDataHash = utils.keccak256(utils.randomBytes(2));
      expect(await fundDeployer.isRegisteredVaultCall(contract, selector, randomDataHash)).toBe(false);
      expect(await fundDeployer.isAllowedVaultCall(contract, selector, randomDataHash)).toBe(true);
    });
  });

  describe('deregisterVaultCalls', () => {
    it('does not allow a random caller', async () => {
      const [randomUser] = fork.accounts;
      const { fundDeployer } = fork.deployment;

      await expect(fundDeployer.connect(randomUser).deregisterVaultCalls([], [], [])).rejects.toBeRevertedWith(
        'Only the contract owner can call this function',
      );
    });

    it('does not allow empty _contracts param', async () => {
      const { fundDeployer } = fork.deployment;

      await expect(fundDeployer.deregisterVaultCalls([], [], [])).rejects.toBeRevertedWith('Empty _contracts');
    });

    it('does not allow unequal param arrays', async () => {
      const { fundDeployer } = fork.deployment;

      const contract = randomAddress();
      const selector = sighash(utils.FunctionFragment.fromString('myTestFunction(address)'));
      const dataHash = utils.keccak256(utils.randomBytes(2));

      await expect(fundDeployer.deregisterVaultCalls([contract], [], [])).rejects.toBeRevertedWith(
        'Uneven input arrays',
      );

      await expect(fundDeployer.deregisterVaultCalls([contract], [selector], [])).rejects.toBeRevertedWith(
        'Uneven input arrays',
      );

      await expect(fundDeployer.deregisterVaultCalls([contract], [], [dataHash])).rejects.toBeRevertedWith(
        'Uneven input arrays',
      );
    });

    it('does not allow an unregistered vaultCall', async () => {
      const { fundDeployer } = fork.deployment;

      const contract = randomAddress();
      const selector = sighash(utils.FunctionFragment.fromString('myTestFunction(address)'));
      const dataHash = utils.keccak256(utils.randomBytes(2));

      expect(await fundDeployer.isRegisteredVaultCall(contract, selector, dataHash)).toBe(false);

      await expect(fundDeployer.deregisterVaultCalls([contract], [selector], [dataHash])).rejects.toBeRevertedWith(
        'Call not registered',
      );
    });

    it('de-registers the vault calls and emits the correct event for each', async () => {
      const { fundDeployer } = fork.deployment;

      const contracts = [randomAddress(), randomAddress()];
      const selectors = ['myTestFunction1(address)', 'myTestFunction2()'].map((functionSig) =>
        sighash(utils.FunctionFragment.fromString(functionSig)),
      );
      const dataHashes = [utils.keccak256(utils.randomBytes(2)), constants.HashZero];

      // Register vault calls
      await fundDeployer.registerVaultCalls(contracts, selectors, dataHashes);

      // Vault calls should be registered and allowed
      for (const i in contracts) {
        expect(await fundDeployer.isRegisteredVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(true);
        expect(await fundDeployer.isAllowedVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(true);
      }

      const tx = await fundDeployer.deregisterVaultCalls(contracts, selectors, dataHashes);

      // Vault calls should not be registered or allowed
      for (const i in contracts) {
        expect(await fundDeployer.isRegisteredVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(false);
        expect(await fundDeployer.isAllowedVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(false);
      }

      // Assert the correct events were emitted
      const events = extractEvent(tx, 'VaultCallDeregistered');
      expect(events.length).toBe(contracts.length);
      for (const i in contracts) {
        expect(events[i].args).toMatchObject({
          contractAddress: contracts[i],
          selector: selectors[i],
          dataHash: dataHashes[i],
        });
      }
    });
  });

  describe('registerVaultCalls', () => {
    it('does not allow a random caller', async () => {
      const [randomUser] = fork.accounts;
      const { fundDeployer } = fork.deployment;

      await expect(fundDeployer.connect(randomUser).registerVaultCalls([], [], [])).rejects.toBeRevertedWith(
        'Only the contract owner can call this function',
      );
    });

    it('does not allow empty _contracts param', async () => {
      const { fundDeployer } = fork.deployment;

      await expect(fundDeployer.registerVaultCalls([], [], [])).rejects.toBeRevertedWith('Empty _contracts');
    });

    it('does not allow unequal param arrays', async () => {
      const { fundDeployer } = fork.deployment;

      const contract = randomAddress();
      const selector = sighash(utils.FunctionFragment.fromString('myTestFunction(address)'));
      const dataHash = utils.keccak256(utils.randomBytes(2));

      await expect(fundDeployer.registerVaultCalls([contract], [], [])).rejects.toBeRevertedWith('Uneven input arrays');

      await expect(fundDeployer.registerVaultCalls([contract], [selector], [])).rejects.toBeRevertedWith(
        'Uneven input arrays',
      );

      await expect(fundDeployer.registerVaultCalls([contract], [], [dataHash])).rejects.toBeRevertedWith(
        'Uneven input arrays',
      );
    });

    it('does not allow an already registered vaultCall', async () => {
      const { fundDeployer } = fork.deployment;
      const [contract, selector, dataHash] = Object.values(fork.config.vaultCalls)[0];

      expect(await fundDeployer.isRegisteredVaultCall(contract, selector, dataHash)).toBe(true);

      await expect(fundDeployer.registerVaultCalls([contract], [selector], [dataHash])).rejects.toBeRevertedWith(
        'Call already registered',
      );
    });

    it('registers the vault calls and emits the correct event for each', async () => {
      const { fundDeployer } = fork.deployment;

      const contracts = [randomAddress(), randomAddress()];
      const selectors = ['myTestFunction1(address)', 'myTestFunction2()'].map((functionSig) =>
        sighash(utils.FunctionFragment.fromString(functionSig)),
      );
      const dataHashes = [utils.keccak256(utils.randomBytes(2)), constants.HashZero];

      // Vault calls should not yet be registered or allowed
      for (const i in contracts) {
        expect(await fundDeployer.isRegisteredVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(false);
        expect(await fundDeployer.isAllowedVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(false);
      }

      const tx = await fundDeployer.registerVaultCalls(contracts, selectors, dataHashes);

      // Vault calls should be registered and allowed
      for (const i in contracts) {
        expect(await fundDeployer.isRegisteredVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(true);
        expect(await fundDeployer.isAllowedVaultCall(contracts[i], selectors[i], dataHashes[i])).toBe(true);
      }

      // Assert the correct events were emitted
      const events = extractEvent(tx, 'VaultCallRegistered');
      expect(events.length).toBe(contracts.length);
      for (const i in contracts) {
        expect(events[i].args).toMatchObject({
          contractAddress: contracts[i],
          selector: selectors[i],
          dataHash: dataHashes[i],
        });
      }
    });
  });
});
