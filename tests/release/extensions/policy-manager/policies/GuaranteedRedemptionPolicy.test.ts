import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  GuaranteedRedemptionPolicy,
  guaranteedRedemptionPolicyArgs,
  ONE_DAY_IN_SECONDS,
  PolicyHook,
  validateRulePostCoIArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

async function addFundSettings({
  comptrollerProxy,
  guaranteedRedemptionPolicy,
  startTimestamp,
  duration,
}: {
  comptrollerProxy: AddressLike;
  guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
    duration,
    startTimestamp,
  });

  await guaranteedRedemptionPolicy.addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig);
}

async function deployStandaloneGuaranteedRedemptionPolicy(fork: ProtocolDeployment, signer?: SignerWithAddress) {
  const [EOAPolicyManager] = fork.accounts.slice(-1);

  const guaranteedRedemptionPolicy = await GuaranteedRedemptionPolicy.deploy(
    fork.deployer,
    EOAPolicyManager,
    fork.deployment.fundDeployer,
    fork.config.policies.guaranteedRedemption.redemptionWindowBuffer,
    [],
  );

  return guaranteedRedemptionPolicy.connect(signer ? signer : EOAPolicyManager);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const guaranteedRedemptionPolicy = fork.deployment.guaranteedRedemptionPolicy;

    const policyManagerResult = await guaranteedRedemptionPolicy.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(fork.deployment.policyManager);

    const fundDeployerResult = await guaranteedRedemptionPolicy.getFundDeployer();
    expect(fundDeployerResult).toMatchAddress(fork.deployment.fundDeployer);

    const redemptionWindowBufferResult = await guaranteedRedemptionPolicy.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(
      fork.config.policies.guaranteedRedemption.redemptionWindowBuffer,
    );

    const implementedHooksResult = await guaranteedRedemptionPolicy.implementedHooks();
    expect(implementedHooksResult).toMatchFunctionOutput(guaranteedRedemptionPolicy.implementedHooks.fragment, [
      PolicyHook.PostCallOnIntegration,
    ]);

    expect(await guaranteedRedemptionPolicy.adapterCanBlockRedemption(fork.deployment.synthetixAdapter)).toBe(true);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork);
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
      duration: constants.Zero,
      startTimestamp: constants.Zero,
    });

    await expect(
      guaranteedRedemptionPolicy
        .connect(randomUser)
        .addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow startTimestamp to be 0 if duration is not 0', async () => {
    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
      duration: constants.One,
      startTimestamp: constants.Zero,
    });
    await expect(
      guaranteedRedemptionPolicy.addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig),
    ).rejects.toBeRevertedWith('duration must be 0 if startTimestamp is 0');
  });

  it('does not allow duration to be 0 if startTimestamp is not 0', async () => {
    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
      duration: constants.Zero,
      startTimestamp: constants.One,
    });
    await expect(
      guaranteedRedemptionPolicy.addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('does not allow a startTimestamp in the future', async () => {
    const latestBlock = await provider.getBlock('latest');
    const futureTimestamp = BigNumber.from(latestBlock.timestamp).add(100);

    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
      duration: constants.Zero,
      startTimestamp: futureTimestamp,
    });
    await expect(
      guaranteedRedemptionPolicy.addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig),
    ).rejects.toBeRevertedWith('startTimestamp must be in past');
  });

  it('does not allow duration to be >23 hours', async () => {
    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({
      duration: 23 * 60 * 60 + 1,
      startTimestamp: constants.One, // 23 hours and 1 second
    });
    await expect(
      guaranteedRedemptionPolicy.addFundSettings(comptrollerProxy, guaranteedRedemptionPolicyConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('sets initial config values for fund and fires event', async () => {
    const startTimestamp = BigNumber.from(1000);
    const duration = BigNumber.from(2000);

    const guaranteedRedemptionPolicyConfig = guaranteedRedemptionPolicyArgs({ duration, startTimestamp });
    const receipt = await guaranteedRedemptionPolicy.addFundSettings(
      comptrollerProxy,
      guaranteedRedemptionPolicyConfig,
    );

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      duration,
      startTimestamp,
    });

    const redemptionWindow = await guaranteedRedemptionPolicy.getRedemptionWindowForFund(comptrollerProxy);
    expect(redemptionWindow).toMatchFunctionOutput(guaranteedRedemptionPolicy.getRedemptionWindowForFund, {
      duration,
      startTimestamp,
    });
  });
});

describe('addRedemptionBlockingAdapters', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      guaranteedRedemptionPolicy.connect(randomUser).addRedemptionBlockingAdapters([]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow adapters to be empty', async () => {
    await expect(guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow adapters to contain address 0', async () => {
    await expect(
      guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([constants.AddressZero]),
    ).rejects.toBeRevertedWith('adapter cannot be empty');
  });

  it('does not allow adding an already added adapter', async () => {
    const adapter = randomAddress();

    const receipt = await guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([adapter]);
    assertEvent(receipt, 'AdapterAdded', { adapter });

    await expect(guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([adapter])).rejects.toBeRevertedWith(
      'adapter already added',
    );
  });

  it('correctly handles adding an adapter and fires an event', async () => {
    const adapter = randomAddress();

    const receipt = await guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterAdded', { adapter });

    expect(await guaranteedRedemptionPolicy.adapterCanBlockRedemption(adapter)).toBe(true);
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork, fork.deployer);

    expect(await guaranteedRedemptionPolicy.canDisable()).toBe(false);
  });
});

describe('removeRedemptionBlockingAdapters', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      guaranteedRedemptionPolicy.connect(randomUser).removeRedemptionBlockingAdapters([]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow adapters to be empty', async () => {
    await expect(guaranteedRedemptionPolicy.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow removing an adapter which is not added yet', async () => {
    await expect(
      guaranteedRedemptionPolicy.removeRedemptionBlockingAdapters([randomAddress()]),
    ).rejects.toBeRevertedWith('adapter is not added');
  });

  it('correctly handles removing adapters and fires events', async () => {
    const adapter = randomAddress();

    await guaranteedRedemptionPolicy.addRedemptionBlockingAdapters([adapter]);

    const receipt = await guaranteedRedemptionPolicy.removeRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterRemoved', { adapter });

    expect(await guaranteedRedemptionPolicy.adapterCanBlockRedemption(adapter)).toBe(false);
  });
});

describe('setRedemptionWindowBuffer', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(guaranteedRedemptionPolicy.connect(randomUser).setRedemptionWindowBuffer(0)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow new redemptionWindowBuffer to be the current redemptionWindowBuffer', async () => {
    await expect(
      guaranteedRedemptionPolicy.setRedemptionWindowBuffer(
        fork.config.policies.guaranteedRedemption.redemptionWindowBuffer,
      ),
    ).rejects.toBeRevertedWith('Value already set');
  });

  it('correctly sets the redemptionWindowBuffer and fires an event', async () => {
    const prevBuffer = fork.config.policies.guaranteedRedemption.redemptionWindowBuffer;
    const nextBuffer = BigNumber.from(100);

    const receipt = await guaranteedRedemptionPolicy.setRedemptionWindowBuffer(nextBuffer);
    assertEvent(receipt, 'RedemptionWindowBufferSet', { nextBuffer, prevBuffer });

    const redemptionWindowBufferResult = await guaranteedRedemptionPolicy.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(nextBuffer);
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let guaranteedRedemptionPolicy: GuaranteedRedemptionPolicy;

  beforeEach(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork);
  });

  it('returns true if there is no adapter in the policy', async () => {
    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: randomAddress(),
      caller: randomAddress(),
      incomingAssetAmounts: [1],
      incomingAssets: [randomAddress()],
      selector: utils.randomBytes(4),
      spendAssetAmounts: [1],
      spendAssets: [randomAddress()],
    });

    const validateRuleResult = await guaranteedRedemptionPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed and current time is beyond the last redemption window', async () => {
    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      duration,
      guaranteedRedemptionPolicy,
      startTimestamp: now.sub(duration),
    });

    const adapter = randomAddress();

    await guaranteedRedemptionPolicy.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter,
      caller: randomAddress(),
      incomingAssetAmounts: [1],
      incomingAssets: [randomAddress()],
      selector: utils.randomBytes(4),
      spendAssetAmounts: [1],
      spendAssets: [randomAddress()],
    });

    const validateRuleResult = await guaranteedRedemptionPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);

    // Should still return true in 24 hours
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
    await provider.send('evm_mine', []);

    expect(
      await guaranteedRedemptionPolicy.validateRule
        .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
        .call(),
    ).toBe(true);
  });

  it('returns false if the adapter is listed and the redemption window is not defined', async () => {
    const adapter = randomAddress();

    await guaranteedRedemptionPolicy.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter,
      caller: randomAddress(),
      incomingAssetAmounts: [1],
      incomingAssets: [randomAddress()],
      selector: utils.randomBytes(4),
      spendAssetAmounts: [1],
      spendAssets: [randomAddress()],
    });

    const validateRuleResult = await guaranteedRedemptionPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed and current time is within the redemption window', async () => {
    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      duration,
      guaranteedRedemptionPolicy,
      startTimestamp: now,
    });

    const adapter = randomAddress();

    await guaranteedRedemptionPolicy.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter,
      caller: randomAddress(),
      incomingAssetAmounts: [1],
      incomingAssets: [randomAddress()],
      selector: utils.randomBytes(4),
      spendAssetAmounts: [1],
      spendAssets: [randomAddress()],
    });

    const validateRuleResult = await guaranteedRedemptionPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);

    // Should still return false in 24 hours
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
    await provider.send('evm_mine', []);

    expect(
      await guaranteedRedemptionPolicy.validateRule
        .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
        .call(),
    ).toBe(false);
  });

  it('returns false if the adapter is listed and current time is within the redemption window buffer', async () => {
    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(1000);

    await addFundSettings({
      comptrollerProxy,
      duration,
      guaranteedRedemptionPolicy,
      startTimestamp: now,
    });

    // Confirm the buffer is greater than the time to warp prior to the window
    const secondsBeforeWindow = 60;
    expect(await guaranteedRedemptionPolicy.getRedemptionWindowBuffer()).toBeGtBigNumber(secondsBeforeWindow);

    // Warp 24 hours to immediately before the next pre-window buffer period
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS - secondsBeforeWindow]);
    await provider.send('evm_mine', []);

    const adapter = randomAddress();

    await guaranteedRedemptionPolicy.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter,
      caller: randomAddress(),
      incomingAssetAmounts: [1],
      incomingAssets: [randomAddress()],
      selector: utils.randomBytes(4),
      spendAssetAmounts: [1],
      spendAssets: [randomAddress()],
    });

    const validateRuleResult = await guaranteedRedemptionPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);

    // Should still return false in 24 hours
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
    await provider.send('evm_mine', []);

    expect(
      await guaranteedRedemptionPolicy.validateRule
        .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
        .call(),
    ).toBe(false);
  });
});

describe('calcLatestRedemptionWindowStart', () => {
  it('returns correct latest startTimestamp after several days', async () => {
    const fork = await deployProtocolFixture();
    const guaranteedRedemptionPolicy = await deployStandaloneGuaranteedRedemptionPolicy(fork);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const twoDays = 172800;
    const startTimestamp = now.sub(twoDays).sub(3);

    const latestStartTimestamp = await guaranteedRedemptionPolicy.calcLatestRedemptionWindowStart(startTimestamp);

    expect(latestStartTimestamp).toEqBigNumber(startTimestamp.add(twoDays));
  });
});
