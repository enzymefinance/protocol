import { extractEvent, MockContract, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { Dispatcher, FundDeployer, sighash, vaultCallAnyDataHash } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state', async () => {
    const { comptrollerLib, fundDeployer, vaultLib, dispatcher, protocolFeeTracker } = fork.deployment;

    expect(await fundDeployer.getCreator()).toMatchAddress(fork.deployer);
    expect(await fundDeployer.getDispatcher()).toMatchAddress(dispatcher);
    expect(await fundDeployer.getOwner()).toMatchAddress(fork.deployer);
    expect(await fundDeployer.releaseIsLive()).toBe(true);

    // Pseudo constants
    expect(await fundDeployer.getComptrollerLib()).toMatchAddress(comptrollerLib);
    expect(await fundDeployer.getProtocolFeeTracker()).toMatchAddress(protocolFeeTracker);
    expect(await fundDeployer.getVaultLib()).toMatchAddress(vaultLib);

    expect(await fundDeployer.getGasLimitsForDestructCall()).toMatchFunctionOutput(
      fundDeployer.getGasLimitsForDestructCall,
      {
        deactivateFeeManagerGasLimit_: 300000,
        payProtocolFeeGasLimit_: 200000,
      },
    );

    for (const [contract, selector, dataHash] of fork.config.vaultCalls) {
      expect(await fundDeployer.isRegisteredVaultCall(contract, selector, dataHash)).toBe(true);
    }

    // GasRelayRecipientMixin
    expect(await fundDeployer.getGasRelayPaymasterFactory()).toMatchAddress(fork.deployment.gasRelayPaymasterFactory);
  });
});

describe('pseudo-constant setters', () => {
  let fundDeployer: FundDeployer;

  beforeEach(async () => {
    // Create a new FundDeployer that does not yet have pseudo-constants set
    fundDeployer = await FundDeployer.deploy(
      fork.deployer,
      fork.deployment.dispatcher,
      fork.deployment.gasRelayPaymasterFactory,
    );
  });

  describe('setComptrollerLib', () => {
    const comptrollerLibAddress = randomAddress();

    it('cannot be called by a random user', async () => {
      const [randomUser] = fork.accounts;

      await expect(fundDeployer.connect(randomUser).setComptrollerLib(comptrollerLibAddress)).rejects.toBeRevertedWith(
        'Only the contract owner can call this function',
      );
    });

    it('cannot be set a second time', async () => {
      await fundDeployer.setComptrollerLib(comptrollerLibAddress);

      await expect(fundDeployer.setComptrollerLib(comptrollerLibAddress)).rejects.toBeRevertedWith(
        'This value can only be set once',
      );
    });

    it('happy path', async () => {
      const result = await fundDeployer.setComptrollerLib(comptrollerLibAddress);

      assertEvent(result, 'ComptrollerLibSet', {
        comptrollerLib: comptrollerLibAddress,
      });
    });
  });

  describe('setProtocolFeeTracker', () => {
    const protocolFeeTrackerAddress = randomAddress();

    it('cannot be called by a random user', async () => {
      const [randomUser] = fork.accounts;

      await expect(
        fundDeployer.connect(randomUser).setProtocolFeeTracker(protocolFeeTrackerAddress),
      ).rejects.toBeRevertedWith('Only the contract owner can call this function');
    });

    it('cannot be set a second time', async () => {
      await fundDeployer.setProtocolFeeTracker(protocolFeeTrackerAddress);

      await expect(fundDeployer.setProtocolFeeTracker(protocolFeeTrackerAddress)).rejects.toBeRevertedWith(
        'This value can only be set once',
      );
    });

    it('happy path', async () => {
      const result = await fundDeployer.setProtocolFeeTracker(protocolFeeTrackerAddress);

      assertEvent(result, 'ProtocolFeeTrackerSet', {
        protocolFeeTracker: protocolFeeTrackerAddress,
      });
    });
  });

  describe('setVaultLib', () => {
    const vaultLibAddress = randomAddress();

    it('cannot be called by a random user', async () => {
      const [randomUser] = fork.accounts;

      await expect(fundDeployer.connect(randomUser).setVaultLib(vaultLibAddress)).rejects.toBeRevertedWith(
        'Only the contract owner can call this function',
      );
    });

    it('cannot be set a second time', async () => {
      await fundDeployer.setVaultLib(vaultLibAddress);

      await expect(fundDeployer.setVaultLib(vaultLibAddress)).rejects.toBeRevertedWith(
        'This value can only be set once',
      );
    });

    it('happy path', async () => {
      const result = await fundDeployer.setVaultLib(vaultLibAddress);

      assertEvent(result, 'VaultLibSet', {
        vaultLib: vaultLibAddress,
      });
    });
  });
});

describe('setReleaseLive', () => {
  let fundDeployer: FundDeployer;
  let mockDispatcher: MockContract<Dispatcher>;
  let creator: SignerWithAddress, dispatcherOwner: SignerWithAddress;

  beforeEach(async () => {
    [creator, dispatcherOwner] = fork.accounts;

    // Use a mock Dispatcher to easily set a distinct owner
    mockDispatcher = await Dispatcher.mock(fork.deployer);
    await mockDispatcher.getOwner.returns(dispatcherOwner);

    fundDeployer = await FundDeployer.deploy(creator, mockDispatcher, fork.deployment.gasRelayPaymasterFactory);
  });

  describe('before setting pseudo-constants', () => {
    it('cannot be called before comptrollerLib is set', async () => {
      const fundDeployer = await FundDeployer.deploy(
        fork.deployer,
        fork.deployment.dispatcher,
        fork.deployment.gasRelayPaymasterFactory,
      );

      // Set other necessary vars
      await fundDeployer.setProtocolFeeTracker(randomAddress());
      await fundDeployer.setVaultLib(randomAddress());

      await expect(fundDeployer.setReleaseLive()).rejects.toBeRevertedWith('comptrollerLib is not set');
    });

    it('cannot be called before protocolFeeTracker is set', async () => {
      const fundDeployer = await FundDeployer.deploy(
        fork.deployer,
        fork.deployment.dispatcher,
        fork.deployment.gasRelayPaymasterFactory,
      );

      // Set other necessary vars
      await fundDeployer.setComptrollerLib(randomAddress());
      await fundDeployer.setVaultLib(randomAddress());

      await expect(fundDeployer.setReleaseLive()).rejects.toBeRevertedWith('protocolFeeTracker is not set');
    });

    it('cannot be called before vaultLib is set', async () => {
      const fundDeployer = await FundDeployer.deploy(
        fork.deployer,
        fork.deployment.dispatcher,
        fork.deployment.gasRelayPaymasterFactory,
      );

      // Set other necessary vars
      await fundDeployer.setComptrollerLib(randomAddress());
      await fundDeployer.setProtocolFeeTracker(randomAddress());

      await expect(fundDeployer.setReleaseLive()).rejects.toBeRevertedWith('vaultLib is not set');
    });
  });

  describe('after setting pseudo-constants', () => {
    beforeEach(async () => {
      await fundDeployer.setComptrollerLib(randomAddress());
      await fundDeployer.setProtocolFeeTracker(randomAddress());
      await fundDeployer.setVaultLib(randomAddress());
    });

    it('can only be called by the contract creator', async () => {
      await expect(fundDeployer.connect(dispatcherOwner).setReleaseLive()).rejects.toBeRevertedWith(
        'Only the creator can call this function',
      );
    });

    it('cannot be called a second time', async () => {
      // Set release as live
      await fundDeployer.setReleaseLive();

      await expect(fundDeployer.setReleaseLive()).rejects.toBeRevertedWith('Already live');
    });

    it('happy path', async () => {
      expect(await fundDeployer.releaseIsLive()).toBe(false);
      expect(await fundDeployer.getOwner()).toMatchAddress(creator);

      const receipt = await fundDeployer.setReleaseLive();

      expect(await fundDeployer.releaseIsLive()).toBe(true);
      expect(await fundDeployer.getOwner()).toMatchAddress(dispatcherOwner);

      assertEvent(receipt, 'ReleaseIsLive');
    });
  });
});

describe('getOwner', () => {
  it.todo('write tests for special ownership conditions of this contract');
});

describe('buyShares caller registry', () => {
  let fundDeployer: FundDeployer;
  let randomUser: SignerWithAddress;

  beforeEach(async () => {
    [randomUser] = fork.accounts;
    fundDeployer = fork.deployment.fundDeployer;
  });

  describe('registerBuySharesOnBehalfCallers', () => {
    const buySharesCallersToRegister = [randomAddress(), randomAddress()];

    it('does not allow a random caller', async () => {
      await expect(
        fundDeployer.connect(randomUser).registerBuySharesOnBehalfCallers(buySharesCallersToRegister),
      ).rejects.toBeRevertedWith('Only the contract owner can call this function');
    });

    it('does not allow an already-registered value', async () => {
      await fundDeployer.registerBuySharesOnBehalfCallers(buySharesCallersToRegister);

      await expect(fundDeployer.registerBuySharesOnBehalfCallers(buySharesCallersToRegister)).rejects.toBeRevertedWith(
        'Caller already registered',
      );
    });

    it('happy path', async () => {
      for (const caller of buySharesCallersToRegister) {
        expect(await fundDeployer.isAllowedBuySharesOnBehalfCaller(caller)).toBe(false);
      }

      const receipt = await fundDeployer.registerBuySharesOnBehalfCallers(buySharesCallersToRegister);

      for (const caller of buySharesCallersToRegister) {
        expect(await fundDeployer.isAllowedBuySharesOnBehalfCaller(caller)).toBe(true);
      }

      const events = extractEvent(receipt, 'BuySharesOnBehalfCallerRegistered');
      expect(events.length).toBe(buySharesCallersToRegister.length);
      for (const i in buySharesCallersToRegister) {
        expect(events[i].args).toMatchObject({
          caller: buySharesCallersToRegister[i],
        });
      }
    });
  });

  describe('deregisterBuySharesOnBehalfCallers', () => {
    const buySharesCallersToDeregister = [randomAddress(), randomAddress()];

    it('does not allow a random caller', async () => {
      // Register the callers to be deregistered
      await fundDeployer.registerBuySharesOnBehalfCallers(buySharesCallersToDeregister);

      await expect(
        fundDeployer.connect(randomUser).deregisterBuySharesOnBehalfCallers(buySharesCallersToDeregister),
      ).rejects.toBeRevertedWith('Only the contract owner can call this function');
    });

    it('does not allow an unregistered value', async () => {
      await expect(
        fundDeployer.deregisterBuySharesOnBehalfCallers(buySharesCallersToDeregister),
      ).rejects.toBeRevertedWith('Caller not registered');
    });

    it('happy path', async () => {
      // Register the callers to be deregistered
      await fundDeployer.registerBuySharesOnBehalfCallers(buySharesCallersToDeregister);

      for (const caller of buySharesCallersToDeregister) {
        expect(await fundDeployer.isAllowedBuySharesOnBehalfCaller(caller)).toBe(true);
      }

      const receipt = await fundDeployer.deregisterBuySharesOnBehalfCallers(buySharesCallersToDeregister);

      for (const caller of buySharesCallersToDeregister) {
        expect(await fundDeployer.isAllowedBuySharesOnBehalfCaller(caller)).toBe(false);
      }

      const events = extractEvent(receipt, 'BuySharesOnBehalfCallerDeregistered');
      expect(events.length).toBe(buySharesCallersToDeregister.length);
      for (const i in buySharesCallersToDeregister) {
        expect(events[i].args).toMatchObject({
          caller: buySharesCallersToDeregister[i],
        });
      }
    });
  });
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
