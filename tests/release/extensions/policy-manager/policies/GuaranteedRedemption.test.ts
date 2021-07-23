import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  GuaranteedRedemption,
  guaranteedRedemptionArgs,
  PolicyHook,
  validateRulePostCoIArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

async function addFundSettings({
  comptrollerProxy,
  guaranteedRedemption,
  startTimestamp,
  duration,
}: {
  comptrollerProxy: AddressLike;
  guaranteedRedemption: GuaranteedRedemption;
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
    startTimestamp,
    duration,
  });

  await guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig);
}

async function deployStandaloneGuaranteedRedemption(fork: ProtocolDeployment, signer?: SignerWithAddress) {
  const [EOAPolicyManager] = fork.accounts.slice(-1);

  const guaranteedRedemption = await GuaranteedRedemption.deploy(
    fork.deployer,
    EOAPolicyManager,
    fork.deployment.fundDeployer,
    fork.config.policies.guaranteedRedemption.redemptionWindowBuffer,
    [],
  );
  return guaranteedRedemption.connect(signer ? signer : EOAPolicyManager);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const guaranteedRedemption = fork.deployment.guaranteedRedemption;

    const policyManagerResult = await guaranteedRedemption.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(fork.deployment.policyManager);

    const fundDeployerResult = await guaranteedRedemption.getFundDeployer();
    expect(fundDeployerResult).toMatchAddress(fork.deployment.fundDeployer);

    const redemptionWindowBufferResult = await guaranteedRedemption.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(
      fork.config.policies.guaranteedRedemption.redemptionWindowBuffer,
    );

    const implementedHooksResult = await guaranteedRedemption.implementedHooks();
    expect(implementedHooksResult).toMatchFunctionOutput(guaranteedRedemption.implementedHooks.fragment, [
      PolicyHook.PostCallOnIntegration,
    ]);

    expect(await guaranteedRedemption.adapterCanBlockRedemption(fork.deployment.synthetixAdapter)).toBe(true);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let guaranteedRedemption: GuaranteedRedemption;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork);
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.Zero,
      duration: constants.Zero,
    });

    await expect(
      guaranteedRedemption.connect(randomUser).addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow startTimestamp to be 0 if duration is not 0', async () => {
    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.Zero,
      duration: constants.One,
    });
    await expect(
      guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be 0 if startTimestamp is 0');
  });

  it('does not allow duration to be 0 if startTimestamp is not 0', async () => {
    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.One,
      duration: constants.Zero,
    });
    await expect(
      guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('does not allow duration to be >23 hours', async () => {
    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.One,
      duration: 23 * 60 * 60 + 1, // 23 hours and 1 second
    });
    await expect(
      guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('sets initial config values for fund and fires event', async () => {
    const startTimestamp = BigNumber.from(1000);
    const duration = BigNumber.from(2000);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({ startTimestamp, duration });
    const receipt = await guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      startTimestamp,
      duration,
    });

    const redemptionWindow = await guaranteedRedemption.getRedemptionWindowForFund(comptrollerProxy);
    expect(redemptionWindow).toMatchFunctionOutput(guaranteedRedemption.getRedemptionWindowForFund, {
      startTimestamp,
      duration,
    });
  });
});

describe('addRedemptionBlockingAdapters', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemption: GuaranteedRedemption;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(guaranteedRedemption.connect(randomUser).addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow adapters to be empty', async () => {
    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow adapters to contain address 0', async () => {
    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([constants.AddressZero])).rejects.toBeRevertedWith(
      'adapter cannot be empty',
    );
  });

  it('does not allow adding an already added adapter', async () => {
    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);
    assertEvent(receipt, 'AdapterAdded', { adapter });

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([adapter])).rejects.toBeRevertedWith(
      'adapter already added',
    );
  });

  it('correctly handles adding an adapter and fires an event', async () => {
    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterAdded', { adapter });

    expect(await guaranteedRedemption.adapterCanBlockRedemption(adapter)).toBe(true);
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork, fork.deployer);

    expect(await guaranteedRedemption.canDisable()).toBe(false);
  });
});

describe('removeRedemptionBlockingAdapters', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemption: GuaranteedRedemption;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      guaranteedRedemption.connect(randomUser).removeRedemptionBlockingAdapters([]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow adapters to be empty', async () => {
    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow removing an adapter which is not added yet', async () => {
    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([randomAddress()])).rejects.toBeRevertedWith(
      'adapter is not added',
    );
  });

  it('correctly handles removing adapters and fires events', async () => {
    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    const receipt = await guaranteedRedemption.removeRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterRemoved', { adapter });

    expect(await guaranteedRedemption.adapterCanBlockRedemption(adapter)).toBe(false);
  });
});

describe('setRedemptionWindowBuffer', () => {
  let fork: ProtocolDeployment;
  let guaranteedRedemption: GuaranteedRedemption;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork, fork.deployer);
  });

  it('can only be called by fundDeployerOwner', async () => {
    const [randomUser] = fork.accounts;

    await expect(guaranteedRedemption.connect(randomUser).setRedemptionWindowBuffer(0)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow new redemptionWindowBuffer to be the current redemptionWindowBuffer', async () => {
    await expect(
      guaranteedRedemption.setRedemptionWindowBuffer(fork.config.policies.guaranteedRedemption.redemptionWindowBuffer),
    ).rejects.toBeRevertedWith('Value already set');
  });

  it('correctly sets the redemptionWindowBuffer and fires an event', async () => {
    const prevBuffer = fork.config.policies.guaranteedRedemption.redemptionWindowBuffer;
    const nextBuffer = BigNumber.from(100);

    const receipt = await guaranteedRedemption.setRedemptionWindowBuffer(nextBuffer);
    assertEvent(receipt, 'RedemptionWindowBufferSet', { prevBuffer, nextBuffer });

    const redemptionWindowBufferResult = await guaranteedRedemption.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(nextBuffer);
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let guaranteedRedemption: GuaranteedRedemption;

  beforeEach(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork);
  });

  it('returns true if there is no adapter in the policy', async () => {
    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter: randomAddress(),
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed and the current time is before the first redemption window', async () => {
    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);

    // Approximate the difference between now and the block.timestamp in validateRule by adding 5 seconds
    await addFundSettings({
      comptrollerProxy,
      guaranteedRedemption,
      startTimestamp: now.add(fork.config.policies.guaranteedRedemption.redemptionWindowBuffer).add(BigNumber.from(5)),
      duration: 300,
    });

    const adapter = randomAddress();

    await guaranteedRedemption.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
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
      guaranteedRedemption,
      startTimestamp: now.sub(duration),
      duration: 300,
    });

    const adapter = randomAddress();

    await guaranteedRedemption.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns false if the adapter is listed and the redemption window is not defined', async () => {
    const adapter = randomAddress();

    await guaranteedRedemption.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
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
      guaranteedRedemption,
      startTimestamp: now.add(duration),
      duration,
    });

    const adapter = randomAddress();

    await guaranteedRedemption.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed and current time is within the redemption window buffer', async () => {
    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      guaranteedRedemption,
      startTimestamp: now.add(BigNumber.from(10)), // approximate to block.timestamp in validateRule by adding 10 seconds
      duration,
    });

    const adapter = randomAddress();

    await guaranteedRedemption.connect(fork.deployer).addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()],
      incomingAssetAmounts: [1],
      spendAssets: [randomAddress()],
      spendAssetAmounts: [1],
    });

    const validateRuleResult = await guaranteedRedemption.validateRule
      .args(comptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });
});

describe('calcLatestRedemptionWindowStart', () => {
  it('returns correct latest startTimestamp after several days', async () => {
    const fork = await deployProtocolFixture();
    const guaranteedRedemption = await deployStandaloneGuaranteedRedemption(fork);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const twoDays = 172800;
    const startTimestamp = now.sub(twoDays).sub(3);

    const latestStartTimestamp = await guaranteedRedemption.calcLatestRedemptionWindowStart(startTimestamp);

    expect(latestStartTimestamp).toEqBigNumber(startTimestamp.add(twoDays));
  });
});
