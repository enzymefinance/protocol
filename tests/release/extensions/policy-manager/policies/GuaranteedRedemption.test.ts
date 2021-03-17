import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import {
  Dispatcher,
  GuaranteedRedemption,
  guaranteedRedemptionArgs,
  PolicyHook,
  validateRulePreCoIArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

async function snapshot() {
  const { deployer, accounts, deployment, config } = await deployProtocolFixture();

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const comptrollerProxy = randomAddress();

  const standaloneGuaranteedRedemption = await GuaranteedRedemption.deploy(
    deployer,
    EOAPolicyManager,
    deployment.fundDeployer,
    config.policies.guaranteedRedemption.redemptionWindowBuffer,
    [],
  );

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    comptrollerProxy,
    standaloneGuaranteedRedemption: standaloneGuaranteedRedemption.connect(EOAPolicyManager),
  };
}

async function getFundDeployerOwner(dispatcher: AddressLike, provider: EthereumTestnetProvider) {
  const dispatcherContract = new Dispatcher(dispatcher, provider);
  return dispatcherContract.getOwner();
}

async function addFundSettings({
  comptrollerProxy,
  standaloneGuaranteedRedemption,
  startTimestamp,
  duration,
}: {
  comptrollerProxy: AddressLike;
  standaloneGuaranteedRedemption: GuaranteedRedemption;
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
    startTimestamp,
    duration,
  });

  await standaloneGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
      },
      deployment: { policyManager, fundDeployer, guaranteedRedemption, synthetixAdapter },
    } = await provider.snapshot(snapshot);

    const policyManagerResult = await guaranteedRedemption.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const fundDeployerResult = await guaranteedRedemption.getFundDeployer();
    expect(fundDeployerResult).toMatchAddress(fundDeployer);

    const redemptionWindowBufferResult = await guaranteedRedemption.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(redemptionWindowBuffer);

    const implementedHooksResult = await guaranteedRedemption.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PreCallOnIntegration]);

    expect(await guaranteedRedemption.adapterCanBlockRedemption(synthetixAdapter)).toBe(true);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { guaranteedRedemption },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.Zero,
      duration: constants.Zero,
    });

    await expect(
      guaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow startTimestamp to be 0 if duration is not 0', async () => {
    const { standaloneGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.Zero,
      duration: constants.One,
    });
    await expect(
      standaloneGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be 0 if startTimestamp is 0');
  });

  it('does not allow duration to be 0 if startTimestamp is not 0', async () => {
    const { standaloneGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.One,
      duration: constants.Zero,
    });
    await expect(
      standaloneGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('does not allow duration to be >23 hours', async () => {
    const { standaloneGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.One,
      duration: 23 * 60 * 60 + 1, // 23 hours and 1 second
    });
    await expect(
      standaloneGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be between 1 second and 23 hours');
  });

  it('sets initial config values for fund and fires event', async () => {
    const { standaloneGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const startTimestamp = BigNumber.from(1000);
    const duration = BigNumber.from(2000);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({ startTimestamp, duration });
    const receipt = await standaloneGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      startTimestamp,
      duration,
    });

    const redemptionWindow = await standaloneGuaranteedRedemption.getRedemptionWindowForFund(comptrollerProxy);
    expect(redemptionWindow).toMatchFunctionOutput(standaloneGuaranteedRedemption.getRedemptionWindowForFund, {
      startTimestamp,
      duration,
    });
  });
});

describe('addRedemptionBlockingAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const { standaloneGuaranteedRedemption } = await provider.snapshot(snapshot);

    await expect(standaloneGuaranteedRedemption.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow adapters to be empty', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow adapters to contain address 0', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([constants.AddressZero])).rejects.toBeRevertedWith(
      'adapter cannot be empty',
    );
  });

  it('does not allow adding an already added adapter', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);
    assertEvent(receipt, 'AdapterAdded', { adapter });

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([adapter])).rejects.toBeRevertedWith(
      'adapter already added',
    );
  });

  it('correctly handles adding an adapter and fires an event', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterAdded', { adapter });

    expect(await standaloneGuaranteedRedemption.adapterCanBlockRedemption(adapter)).toBe(true);
  });
});

describe('removeRedemptionBlockingAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const { standaloneGuaranteedRedemption } = await provider.snapshot(snapshot);

    await expect(standaloneGuaranteedRedemption.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow adapters to be empty', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters cannot be empty',
    );
  });

  it('does not allow removing an adapter which is not added yet', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([randomAddress()])).rejects.toBeRevertedWith(
      'adapter is not added',
    );
  });

  it('correctly handles removing adapters and fires events', async () => {
    const {
      deployment: { dispatcher },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    const receipt = await guaranteedRedemption.removeRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterRemoved', { adapter });

    expect(await standaloneGuaranteedRedemption.adapterCanBlockRedemption(adapter)).toBe(false);
  });
});

describe('setRedemptionWindowBuffer', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const { standaloneGuaranteedRedemption } = await provider.snapshot(snapshot);

    await expect(standaloneGuaranteedRedemption.setRedemptionWindowBuffer(0)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow new redemptionWindowBuffer to be the current redemptionWindowBuffer', async () => {
    const {
      deployment: { dispatcher },
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
      },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.setRedemptionWindowBuffer(redemptionWindowBuffer)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  it('correctly sets the redemptionWindowBuffer and fires an event', async () => {
    const {
      deployment: { dispatcher },
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer: prevBuffer },
        },
      },
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const nextBuffer = BigNumber.from(100);

    const receipt = await guaranteedRedemption.setRedemptionWindowBuffer(nextBuffer);
    assertEvent(receipt, 'RedemptionWindowBufferSet', { prevBuffer, nextBuffer });

    const redemptionWindowBufferResult = await guaranteedRedemption.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(nextBuffer);
  });
});

describe('validateRule', () => {
  it('returns true if there is no adapter in the policy', async () => {
    const { comptrollerProxy, standaloneGuaranteedRedemption } = await provider.snapshot(snapshot);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: randomAddress(),
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed and the current time is before the first redemption window', async () => {
    const {
      deployment: { dispatcher },
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
      },
      comptrollerProxy,
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);

    // Approximate the difference between now and the block.timestamp in validateRule by adding 5 seconds
    await addFundSettings({
      comptrollerProxy,
      standaloneGuaranteedRedemption,
      startTimestamp: now.add(redemptionWindowBuffer).add(BigNumber.from(5)),
      duration: 300,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed and current time is beyond the lst redemption window', async () => {
    const {
      deployment: { dispatcher },
      comptrollerProxy,
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      standaloneGuaranteedRedemption,
      startTimestamp: now.sub(duration),
      duration: 300,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns false if the adapter is listed and the redemption window is not defined', async () => {
    const {
      deployment: { dispatcher },
      comptrollerProxy,
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed and current time is within the redemption window', async () => {
    const {
      deployment: { dispatcher },
      comptrollerProxy,
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      standaloneGuaranteedRedemption,
      startTimestamp: now.add(duration),
      duration,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed and current time is within the redemption window buffer', async () => {
    const {
      deployment: { dispatcher },
      comptrollerProxy,
      standaloneGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      standaloneGuaranteedRedemption,
      startTimestamp: now.add(BigNumber.from(10)), // approximate to block.timestamp in validateRule by adding 10 seconds
      duration,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = standaloneGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await standaloneGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });
});

describe('calcLatestRedemptionWindowStart', () => {
  it('returns correct latest startTimestamp after several days', async () => {
    const { standaloneGuaranteedRedemption } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const twoDays = 172800;
    const startTimestamp = now.sub(twoDays).sub(3);

    const latestStartTimestamp = await standaloneGuaranteedRedemption.calcLatestRedemptionWindowStart(startTimestamp);

    expect(latestStartTimestamp).toEqBigNumber(startTimestamp.add(twoDays));
  });
});

// TODO integration tests
