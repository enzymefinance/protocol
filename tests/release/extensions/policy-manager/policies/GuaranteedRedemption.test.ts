import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import { AddressLike, EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import {
  GuaranteedRedemption,
  guaranteedRedemptionArgs,
  Dispatcher,
  PolicyHook,
  validateRulePreCoIArgs,
} from '@melonproject/protocol';
import { assertEvent, defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const comptrollerProxy = randomAddress();

  const guaranteedRedemption1 = await GuaranteedRedemption.deploy(
    config.deployer,
    EOAPolicyManager,
    deployment.fundDeployer,
    config.policies.guaranteedRedemption.redemptionWindowBuffer,
    [],
  );
  const unconfiguredGuaranteedRedemption = guaranteedRedemption1.connect(EOAPolicyManager);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    comptrollerProxy,
    unconfiguredGuaranteedRedemption,
  };
}

async function getFundDeployerOwner(dispatcher: AddressLike, provider: EthereumTestnetProvider) {
  const dispatcherContract = new Dispatcher(dispatcher, provider);
  return dispatcherContract.getOwner();
}

async function addFundSettings({
  comptrollerProxy,
  unconfiguredGuaranteedRedemption,
  startTimestamp,
  duration,
}: {
  comptrollerProxy: AddressLike;
  unconfiguredGuaranteedRedemption: GuaranteedRedemption;
  startTimestamp: BigNumberish;
  duration: BigNumberish;
}) {
  const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
    startTimestamp,
    duration,
  });

  await unconfiguredGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
      },
      deployment: { policyManager, fundDeployer, guaranteedRedemption },
    } = await provider.snapshot(snapshot);

    const policyManagerResult = await guaranteedRedemption.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const fundDeployerResult = await guaranteedRedemption.getFundDeployer();
    expect(fundDeployerResult).toMatchAddress(fundDeployer);

    const redemptionWindowBufferResult = await guaranteedRedemption.getRedemptionWindowBuffer();
    expect(redemptionWindowBufferResult).toEqBigNumber(redemptionWindowBuffer);

    const implementedHooksResult = await guaranteedRedemption.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PreCallOnIntegration]);
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

  it('does not allow duration to be 0 unless startTimestamp is 0', async () => {
    const { unconfiguredGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.Zero,
      duration: constants.One,
    });
    await expect(
      unconfiguredGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be 0 if startTimestamp is 0');
  });

  it('does not allow duration to be 0 unless startTimestamp is not 0', async () => {
    const { unconfiguredGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({
      startTimestamp: constants.One,
      duration: constants.Zero,
    });
    await expect(
      unconfiguredGuaranteedRedemption.addFundSettings(comptrollerProxy, guaranteedRedemptionConfig),
    ).rejects.toBeRevertedWith('duration must be less than one day');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { unconfiguredGuaranteedRedemption, comptrollerProxy } = await provider.snapshot(snapshot);

    const startTimestamp = BigNumber.from(1000);
    const duration = BigNumber.from(2000);

    const guaranteedRedemptionConfig = guaranteedRedemptionArgs({ startTimestamp, duration });
    const receipt = await unconfiguredGuaranteedRedemption.addFundSettings(
      comptrollerProxy,
      guaranteedRedemptionConfig,
    );

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      startTimestamp,
      duration,
    });

    const redemptionWindow = await unconfiguredGuaranteedRedemption.getRedemptionWindowForFund(comptrollerProxy);
    expect(redemptionWindow).toMatchFunctionOutput(unconfiguredGuaranteedRedemption.getRedemptionWindowForFund, {
      startTimestamp,
      duration,
    });
  });
});

describe('addRedemptionBlockingAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    await expect(unconfiguredGuaranteedRedemption.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await guaranteedRedemption.addRedemptionBlockingAdapters([randomAddress()]);
  });

  it('does not allow adapters to be empty', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters can not be empty',
    );
  });

  it('does not allow adapters to contain address 0', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([constants.AddressZero])).rejects.toBeRevertedWith(
      'adapter can not be address 0',
    );
  });

  it('does not allow adding an already added adapter', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);
    assertEvent(receipt, 'AdapterAdded', { adapter });

    await expect(guaranteedRedemption.addRedemptionBlockingAdapters([adapter])).rejects.toBeRevertedWith(
      'adapter already added',
    );
  });

  it('correctly handles adding adapters and fires events', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    const receipt = await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterAdded', { adapter });
  });
});

describe('removeRedemptionBlockingAdapters', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    await expect(unconfiguredGuaranteedRedemption.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);
    await guaranteedRedemption.removeRedemptionBlockingAdapters([adapter]);
  });

  it('does not allow adapters to be empty', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([])).rejects.toBeRevertedWith(
      '_adapters can not be empty',
    );
  });

  it('does not allow removing an adapter which is not added yet', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await guaranteedRedemption.addRedemptionBlockingAdapters([randomAddress()]);

    await expect(guaranteedRedemption.removeRedemptionBlockingAdapters([randomAddress()])).rejects.toBeRevertedWith(
      'adapter is not added',
    );
  });

  it('correctly handles removing adapters and fires events', async () => {
    const {
      config: { dispatcher },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    const receipt = await guaranteedRedemption.removeRedemptionBlockingAdapters([adapter]);

    assertEvent(receipt, 'AdapterRemoved', { adapter });
  });
});

describe('setRedemptionWindowBuffer', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const { unconfiguredGuaranteedRedemption } = await provider.snapshot(snapshot);

    await expect(unconfiguredGuaranteedRedemption.setRedemptionWindowBuffer(0)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('does not allow new redemptionWindowBuffer to be the current redemptionWindowBuffer', async () => {
    const {
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
        dispatcher,
      },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    await expect(guaranteedRedemption.setRedemptionWindowBuffer(redemptionWindowBuffer)).rejects.toBeRevertedWith(
      '_redemptionWindowBuffer value is already set',
    );
  });

  it('correctly sets the redemptionWindowBuffer and fires events', async () => {
    const {
      config: {
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer: prevBuffer },
        },
        dispatcher,
      },
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
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
    const { comptrollerProxy, unconfiguredGuaranteedRedemption } = await provider.snapshot(snapshot);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter: randomAddress(),
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed in the policy and current time does not reach the redemption window', async () => {
    const {
      config: {
        dispatcher,
        policies: {
          guaranteedRedemption: { redemptionWindowBuffer },
        },
      },
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);

    await addFundSettings({
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
      startTimestamp: now.add(redemptionWindowBuffer).add(BigNumber.from(5)), // approximate the difference between now and the block.timestamp in validateRule by adding 5 seconds
      duration: 300,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns true if the adapter is listed in the policy and current time pasts the redemption window', async () => {
    const {
      config: { dispatcher },
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
      startTimestamp: now.sub(duration),
      duration: 300,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(true);
  });

  it('returns false if the adapter is listed in the policy and the redemption window is not defined', async () => {
    const {
      config: { dispatcher },
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed in the policy and current time is within the redemption window', async () => {
    const {
      config: { dispatcher },
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
      startTimestamp: now.add(duration),
      duration,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });

  it('returns false if the adapter is listed in the policy and current time is within the redemption window buffer', async () => {
    const {
      config: { dispatcher },
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
    } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const duration = BigNumber.from(300);

    await addFundSettings({
      comptrollerProxy,
      unconfiguredGuaranteedRedemption,
      startTimestamp: now.add(BigNumber.from(10)), // approximate to block.timestamp in validateRule by adding 10 seconds
      duration,
    });

    const fundDeployerOwner = await getFundDeployerOwner(dispatcher, provider);
    const guaranteedRedemption = unconfiguredGuaranteedRedemption.connect(
      await provider.getSignerWithAddress(fundDeployerOwner),
    );

    const adapter = randomAddress();

    await guaranteedRedemption.addRedemptionBlockingAdapters([adapter]);

    // Only the adapter arg matters for this policy
    const preCoIArgs = validateRulePreCoIArgs({
      adapter,
      selector: utils.randomBytes(4),
    });

    const validateRuleResult = await unconfiguredGuaranteedRedemption.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreCallOnIntegration, preCoIArgs)
      .call();

    expect(validateRuleResult).toBe(false);
  });
});

describe('calcNextRedemptionWindowStartTimestamp', () => {
  it('returns correct latest startTimestamp after several days', async () => {
    const { unconfiguredGuaranteedRedemption } = await provider.snapshot(snapshot);

    const latestBlock = await provider.getBlock('latest');
    const now = BigNumber.from(latestBlock.timestamp);
    const twoDays = 172800;
    const startTimestamp = now.sub(twoDays).sub(3);

    const latestStartTimestamp = await unconfiguredGuaranteedRedemption.calcNextRedemptionWindowStartTimestamp(
      startTimestamp,
    );

    expect(latestStartTimestamp).toEqBigNumber(startTimestamp.add(twoDays));
  });
});

// TODO integration tests
