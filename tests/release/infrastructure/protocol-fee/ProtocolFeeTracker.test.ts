import type { AddressLike, MockContract } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import { calcProtocolFeeSharesDue, FundDeployer, ProtocolFeeTracker, VaultLib } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture, transactionTimestamp } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('initializeForVault', () => {
  let protocolFeeTracker: ProtocolFeeTracker;
  let fundDeployerSigner: SignerWithAddress, remainingAccounts: SignerWithAddress[];

  beforeEach(async () => {
    [fundDeployerSigner, ...remainingAccounts] = fork.accounts;

    // Deploy a new ProtocolFeeTracker to easily initialize a VaultProxy address
    protocolFeeTracker = await ProtocolFeeTracker.deploy(fork.deployer, fundDeployerSigner);
  });

  it('is not callable by a random user', async () => {
    const [randomUser] = remainingAccounts;

    await expect(protocolFeeTracker.connect(randomUser).initializeForVault(randomAddress())).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('happy path', async () => {
    const vaultProxyAddress = randomAddress();

    const receipt = await protocolFeeTracker.connect(fundDeployerSigner).initializeForVault(vaultProxyAddress);

    // Assert the lastPaid timestamp is correctly set to the time of the tx
    expect(await protocolFeeTracker.getLastPaidForVault(vaultProxyAddress)).toEqBigNumber(
      await transactionTimestamp(receipt),
    );

    // Assert the correct event was emitted
    assertEvent(receipt, 'InitializedForVault', {
      vaultProxy: vaultProxyAddress,
    });
  });
});

describe('payFee', () => {
  let mockFundDeployer: MockContract<FundDeployer>, protocolFeeTracker: ProtocolFeeTracker;
  let mockVaultProxy: MockContract<VaultLib>;
  let fundDeployerOwner: SignerWithAddress, remainingAccounts: SignerWithAddress[];

  beforeEach(async () => {
    [fundDeployerOwner, ...remainingAccounts] = fork.accounts;

    // Deploy a new ProtocolFeeTracker with mockFundDeployer to easily initialize the vaultProxy and turn on the fee
    mockFundDeployer = await FundDeployer.mock(fork.deployer);
    await mockFundDeployer.getOwner.returns(fundDeployerOwner);
    protocolFeeTracker = await ProtocolFeeTracker.deploy(fork.deployer, mockFundDeployer);

    // Use a 1000 bps (10%) fee for simple calcs
    await protocolFeeTracker.connect(fundDeployerOwner).setFeeBpsDefault(1000);

    // Mock a VaultProxy to easily manipulate the shares supply
    mockVaultProxy = await VaultLib.mock(fork.deployer);
    await mockVaultProxy.totalSupply.returns(0);
  });

  it('does not allow an uninitialized caller', async () => {
    const [randomUser] = remainingAccounts;

    await expect(protocolFeeTracker.connect(randomUser).payFee()).rejects.toBeRevertedWith(
      'VaultProxy not initialized',
    );
  });

  describe('Happy paths', () => {
    beforeEach(async () => {
      // Initialize VaultProxy
      await mockFundDeployer.forward(protocolFeeTracker.initializeForVault, mockVaultProxy);

      // Warp time so that a protocol fee will be due
      // Warp by 1 year for simple calcs
      await provider.send('evm_increaseTime', [60 * 60 * 24 * 365.25]);
    });

    it('0 shares supply', async () => {
      // Call the function without a tx first to assert return value
      const sharesDue = await protocolFeeTracker.payFee.from(mockVaultProxy).call();

      expect(sharesDue).toEqBigNumber(0);

      const preTxLastPaidTimestamp = await protocolFeeTracker.getLastPaidForVault(mockVaultProxy);

      const receipt = await mockVaultProxy.forward(protocolFeeTracker.payFee);

      const txTimestamp = await transactionTimestamp(receipt);

      // lastPaid should be updated to the tx timestamp
      expect(await protocolFeeTracker.getLastPaidForVault(mockVaultProxy)).toEqBigNumber(txTimestamp);

      assertEvent(receipt, 'FeePaidForVault', {
        secondsPaid: BigNumber.from(txTimestamp).sub(preTxLastPaidTimestamp),
        sharesAmount: 0,
        vaultProxy: mockVaultProxy,
      });
    });

    it('>0 shares supply, default protocol fee', async () => {
      // Give a positive value of shares total supply that makes calcs simple
      const sharesSupply = utils.parseEther('10');

      await mockVaultProxy.totalSupply.returns(sharesSupply);

      const preTxLastPaidTimestamp = await protocolFeeTracker.getLastPaidForVault(mockVaultProxy);

      // Call the function without a tx first to get the return value
      const sharesDueReturnValue = await protocolFeeTracker.payFee.from(mockVaultProxy).call();

      const receipt = await mockVaultProxy.forward(protocolFeeTracker.payFee);

      const txTimestamp = await transactionTimestamp(receipt);

      // lastPaid should be updated to the tx timestamp
      expect(await protocolFeeTracker.getLastPaidForVault(mockVaultProxy)).toEqBigNumber(txTimestamp);

      // Calculate the expected protocol fee using the in-code formula
      const secondsSinceLastPaid = BigNumber.from(txTimestamp).sub(preTxLastPaidTimestamp);
      const expectedProtocolFee = await calcProtocolFeeSharesDue({
        protocolFeeTracker,
        secondsSinceLastPaid,
        sharesSupply,
        vaultProxyAddress: mockVaultProxy,
      });

      expect(expectedProtocolFee).toBeGtBigNumber(0);

      // Manually assert the fee calculation in both the call return value and the emitted event.
      // Expected shares due for roughly 1 year should be around 10% of its total supply (10 units),
      // i.e., 1 raw unit, or 1.1111... fully inflated
      const tolerance = 1000000000000;

      expect(expectedProtocolFee).toBeAroundBigNumber(utils.parseEther('1.111111111111111111'), tolerance);
      expect(sharesDueReturnValue).toBeAroundBigNumber(expectedProtocolFee, tolerance);

      assertEvent(receipt, 'FeePaidForVault', {
        secondsPaid: BigNumber.from(txTimestamp).sub(preTxLastPaidTimestamp),
        sharesAmount: expectedProtocolFee,
        vaultProxy: mockVaultProxy,
      });
    });

    it('>0 shares supply, protocol fee override', async () => {
      // Set the protocol fee override to 20% for the VaultProxy
      const feeBpsOverride = 2000;

      await protocolFeeTracker.connect(fundDeployerOwner).setFeeBpsOverrideForVault(mockVaultProxy, feeBpsOverride);
      expect(await protocolFeeTracker.getFeeBpsForVault(mockVaultProxy)).toEqBigNumber(feeBpsOverride);

      // Give a positive value of shares total supply that makes calcs simple
      const sharesSupply = utils.parseEther('10');

      await mockVaultProxy.totalSupply.returns(sharesSupply);

      const preTxLastPaidTimestamp = await protocolFeeTracker.getLastPaidForVault(mockVaultProxy);

      // Call the function without a tx first to get the return value
      const sharesDueReturnValue = await protocolFeeTracker.payFee.from(mockVaultProxy).call();

      const receipt = await mockVaultProxy.forward(protocolFeeTracker.payFee);

      const txTimestamp = await transactionTimestamp(receipt);

      // lastPaid should be updated to the tx timestamp
      expect(await protocolFeeTracker.getLastPaidForVault(mockVaultProxy)).toEqBigNumber(txTimestamp);

      // Calculate the expected protocol fee using the in-code formula
      const secondsSinceLastPaid = BigNumber.from(txTimestamp).sub(preTxLastPaidTimestamp);
      const expectedProtocolFee = await calcProtocolFeeSharesDue({
        protocolFeeTracker,
        secondsSinceLastPaid,
        sharesSupply,
        vaultProxyAddress: mockVaultProxy,
      });

      expect(expectedProtocolFee).toBeGtBigNumber(0);

      // Manually assert the fee calculation in both the call return value and the emitted event.
      // Expected shares due for roughly 1 year should be around 20% of its total supply (10 units),
      // i.e., 2 raw units, or 2.5 fully inflated
      const tolerance = 1000000000000;

      expect(expectedProtocolFee).toBeAroundBigNumber(utils.parseEther('2.5'), tolerance);
      expect(sharesDueReturnValue).toBeAroundBigNumber(expectedProtocolFee, tolerance);

      assertEvent(receipt, 'FeePaidForVault', {
        secondsPaid: BigNumber.from(txTimestamp).sub(preTxLastPaidTimestamp),
        sharesAmount: expectedProtocolFee,
        vaultProxy: mockVaultProxy,
      });
    });
  });
});

describe('admin functions', () => {
  describe('setFeeBpsDefault', () => {
    let protocolFeeTracker: ProtocolFeeTracker;
    let remainingAccounts: SignerWithAddress[];
    let nextFeeBpsDefault: BigNumberish;

    beforeEach(async () => {
      protocolFeeTracker = fork.deployment.protocolFeeTracker;
      remainingAccounts = fork.accounts;

      // Guarantees next value is not the current value
      nextFeeBpsDefault = (await protocolFeeTracker.getFeeBpsDefault()).add(2);
    });

    it('does not allow a random caller', async () => {
      const [randomUser] = remainingAccounts;

      await expect(protocolFeeTracker.connect(randomUser).setFeeBpsDefault(nextFeeBpsDefault)).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow a value >= 10000 bps', async () => {
      await expect(protocolFeeTracker.setFeeBpsDefault(10000)).rejects.toBeRevertedWith('Exceeds max');
    });

    it('happy path', async () => {
      const receipt = await protocolFeeTracker.setFeeBpsDefault(nextFeeBpsDefault);

      expect(await protocolFeeTracker.getFeeBpsDefault()).toEqBigNumber(nextFeeBpsDefault);

      assertEvent(receipt, 'FeeBpsDefaultSet', {
        nextFeeBpsDefault,
      });
    });
  });

  describe('setFeeBpsOverrideForVault', () => {
    let protocolFeeTracker: ProtocolFeeTracker;
    let remainingAccounts: SignerWithAddress[];
    let nextFeeBpsOverride: BigNumberish;
    let vaultProxyAddress: AddressLike;

    beforeEach(async () => {
      protocolFeeTracker = fork.deployment.protocolFeeTracker;
      remainingAccounts = fork.accounts;

      vaultProxyAddress = randomAddress();

      // Guarantees nextFeeBpsOverride value is not the feeBpsDefault value
      nextFeeBpsOverride = (await protocolFeeTracker.getFeeBpsDefault()).add(2);
    });

    it('does not allow a random caller', async () => {
      const [randomUser] = remainingAccounts;

      await expect(
        protocolFeeTracker.connect(randomUser).setFeeBpsOverrideForVault(vaultProxyAddress, nextFeeBpsOverride),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow a value >= 10000 bps', async () => {
      await expect(protocolFeeTracker.setFeeBpsOverrideForVault(vaultProxyAddress, 10000)).rejects.toBeRevertedWith(
        'Exceeds max',
      );
    });

    it('happy path', async () => {
      const receipt = await protocolFeeTracker.setFeeBpsOverrideForVault(vaultProxyAddress, nextFeeBpsOverride);

      // Assert the storage var was correctly set
      expect(await protocolFeeTracker.getFeeBpsOverrideForVault(vaultProxyAddress)).toEqBigNumber(nextFeeBpsOverride);

      // Confirm the override works
      expect(await protocolFeeTracker.getFeeBpsForVault(vaultProxyAddress)).toEqBigNumber(nextFeeBpsOverride);

      assertEvent(receipt, 'FeeBpsOverrideSetForVault', {
        nextFeeBpsOverride,
        vaultProxy: vaultProxyAddress,
      });
    });
  });

  describe('setLastPaidForVault', () => {
    let mockFundDeployer: MockContract<FundDeployer>, protocolFeeTracker: ProtocolFeeTracker;
    let remainingAccounts: SignerWithAddress[];
    let nextTimestamp: BigNumberish;
    let vaultProxyAddress: AddressLike;

    beforeEach(async () => {
      remainingAccounts = fork.accounts;

      // Deploy a new ProtocolFeeTracker with mockFundDeployer to easily initialize the vaultProxy
      // while providing the correct value for access control
      mockFundDeployer = await FundDeployer.mock(fork.deployer);
      await mockFundDeployer.getOwner.returns(fork.deployer);
      protocolFeeTracker = await ProtocolFeeTracker.deploy(fork.deployer, mockFundDeployer);

      vaultProxyAddress = randomAddress();

      // Random timestamp 100 years in the future
      nextTimestamp = 4781021061;
    });

    it('does not allow a random caller', async () => {
      const [randomUser] = remainingAccounts;

      await expect(
        protocolFeeTracker.connect(randomUser).setLastPaidForVault(vaultProxyAddress, nextTimestamp),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow an uninitialized VaultProxy', async () => {
      await expect(protocolFeeTracker.setLastPaidForVault(vaultProxyAddress, nextTimestamp)).rejects.toBeRevertedWith(
        '_vaultProxy not initialized',
      );
    });

    it('does not allow a value <= the previous lastPaid (if in the past)', async () => {
      // Initialize VaultProxy
      await mockFundDeployer.forward(protocolFeeTracker.initializeForVault, vaultProxyAddress);

      const prevLastPaid = await protocolFeeTracker.getLastPaidForVault(vaultProxyAddress);

      await expect(
        protocolFeeTracker.setLastPaidForVault(vaultProxyAddress, prevLastPaid.sub(1)),
      ).rejects.toBeRevertedWith('Can only increase or set a future timestamp');
    });

    it('happy path', async () => {
      // Initialize VaultProxy
      await mockFundDeployer.forward(protocolFeeTracker.initializeForVault, vaultProxyAddress);

      const prevTimestamp = await protocolFeeTracker.getLastPaidForVault(vaultProxyAddress);

      const receipt = await protocolFeeTracker.setLastPaidForVault(vaultProxyAddress, nextTimestamp);

      expect(await protocolFeeTracker.getLastPaidForVault(vaultProxyAddress)).toEqBigNumber(nextTimestamp);

      assertEvent(receipt, 'LastPaidSetForVault', {
        nextTimestamp,
        prevTimestamp,
        vaultProxy: vaultProxyAddress,
      });
    });
  });
});
