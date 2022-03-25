import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import {
  MinMaxInvestmentPolicy,
  minMaxInvestmentPolicyArgs,
  PolicyHook,
  validateRulePostBuySharesArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

async function addFundSettings({
  comptrollerProxy,
  minMaxInvestmentPolicy,
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  comptrollerProxy: AddressLike;
  minMaxInvestmentPolicy: MinMaxInvestmentPolicy;
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
    maxInvestmentAmount,
    minInvestmentAmount,
  });

  await minMaxInvestmentPolicy.addFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig);
}

async function updateFundSettings({
  comptrollerProxy,
  minMaxInvestmentPolicy,
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  comptrollerProxy: AddressLike;
  minMaxInvestmentPolicy: MinMaxInvestmentPolicy;
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
    maxInvestmentAmount,
    minInvestmentAmount,
  });

  await minMaxInvestmentPolicy.updateFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig);
}

async function deployAndConfigureStandaloneMinMaxInvestmentPolicy(
  fork: ProtocolDeployment,
  {
    comptrollerProxy = '0x',
    minInvestmentAmount = 0,
    maxInvestmentAmount = 0,
  }: {
    comptrollerProxy?: AddressLike;
    minInvestmentAmount?: BigNumberish;
    maxInvestmentAmount?: BigNumberish;
  },
) {
  const [EOAPolicyManager] = fork.accounts.slice(-1);

  let minMaxInvestmentPolicy = await MinMaxInvestmentPolicy.deploy(fork.deployer, EOAPolicyManager);

  minMaxInvestmentPolicy = minMaxInvestmentPolicy.connect(EOAPolicyManager);

  if (comptrollerProxy !== '0x') {
    await addFundSettings({
      comptrollerProxy,
      maxInvestmentAmount,
      minInvestmentAmount,
      minMaxInvestmentPolicy,
    });
  }

  return minMaxInvestmentPolicy;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const minMaxInvestmentPolicy = fork.deployment.minMaxInvestmentPolicy;

    const getPolicyManagerCall = await minMaxInvestmentPolicy.getPolicyManager();

    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await minMaxInvestmentPolicy.implementedHooks();

    expect(implementedHooksCall).toMatchFunctionOutput(minMaxInvestmentPolicy.implementedHooks.fragment, [
      PolicyHook.PostBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestmentPolicy: MinMaxInvestmentPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestmentPolicy = await deployAndConfigureStandaloneMinMaxInvestmentPolicy(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount: utils.parseEther('2'),
      minInvestmentAmount: utils.parseEther('1'),
    });

    await expect(
      minMaxInvestmentPolicy.connect(randomUser).addFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    {
      const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
        maxInvestmentAmount: utils.parseEther('1'),
        minInvestmentAmount: utils.parseEther('1'),
      });

      await expect(
        minMaxInvestmentPolicy.addFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
      ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
    }

    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount: utils.parseEther('1'),
      minInvestmentAmount: utils.parseEther('2'),
    });

    await expect(
      minMaxInvestmentPolicy.addFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
    ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
  });

  it('sets initial config values for fund and fires events', async () => {
    const minInvestmentAmount = utils.parseEther('1');
    const maxInvestmentAmount = utils.parseEther('2');

    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount,
      minInvestmentAmount,
    });

    const receipt = await minMaxInvestmentPolicy.addFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      maxInvestmentAmount,
      minInvestmentAmount,
    });

    const fundSettings = await minMaxInvestmentPolicy.getFundSettings(comptrollerProxy);

    expect(fundSettings).toMatchFunctionOutput(minMaxInvestmentPolicy.getFundSettings, {
      maxInvestmentAmount,
      minInvestmentAmount,
    });
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    const fork = await deployProtocolFixture();
    const minMaxInvestmentPolicy = await deployAndConfigureStandaloneMinMaxInvestmentPolicy(fork, {});

    expect(await minMaxInvestmentPolicy.canDisable()).toBe(true);
  });
});

describe('updateFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestmentPolicy: MinMaxInvestmentPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestmentPolicy = await deployAndConfigureStandaloneMinMaxInvestmentPolicy(fork, {});
  });

  it('can only be called by the policy manager', async () => {
    const [randomUser] = fork.accounts;

    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount: utils.parseEther('2'),
      minInvestmentAmount: utils.parseEther('1'),
    });

    await expect(
      minMaxInvestmentPolicy.connect(randomUser).updateFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    {
      const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
        maxInvestmentAmount: utils.parseEther('1'),
        minInvestmentAmount: utils.parseEther('1'),
      });

      await expect(
        minMaxInvestmentPolicy.updateFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
      ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
    }
    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount: utils.parseEther('1'),
      minInvestmentAmount: utils.parseEther('2'),
    });

    await expect(
      minMaxInvestmentPolicy.updateFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig),
    ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
  });

  it('updates config values for fund and fires events', async () => {
    const minInvestmentAmount = utils.parseEther('3');
    const maxInvestmentAmount = utils.parseEther('4');

    const minMaxInvestmentPolicyConfig = minMaxInvestmentPolicyArgs({
      maxInvestmentAmount,
      minInvestmentAmount,
    });

    const receipt = await minMaxInvestmentPolicy.updateFundSettings(comptrollerProxy, minMaxInvestmentPolicyConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      maxInvestmentAmount,
      minInvestmentAmount,
    });

    const fundSettings = await minMaxInvestmentPolicy.getFundSettings(comptrollerProxy);

    expect(fundSettings).toMatchFunctionOutput(minMaxInvestmentPolicy.getFundSettings, {
      maxInvestmentAmount,
      minInvestmentAmount,
    });
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestmentPolicy: MinMaxInvestmentPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestmentPolicy = await deployAndConfigureStandaloneMinMaxInvestmentPolicy(fork, {
      comptrollerProxy,
      maxInvestmentAmount: utils.parseEther('2'),
      minInvestmentAmount: utils.parseEther('1'),
    });
  });

  it('returns true if the investmentAmount is within bounds', async () => {
    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestmentPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if the investmentAmount is out of bounds', async () => {
    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('3'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestmentPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('returns false if both the minInvestmentAmount and maxInvestmentAmount equal to 0 (can be used to temporarily close the fund) unless investmentAmount is 0', async () => {
    await updateFundSettings({
      comptrollerProxy,
      maxInvestmentAmount: utils.parseEther('0'),
      minInvestmentAmount: utils.parseEther('0'),
      minMaxInvestmentPolicy,
    });

    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestmentPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('correctly handles when minInvestmentAmount equals to 0', async () => {
    await updateFundSettings({
      comptrollerProxy,
      maxInvestmentAmount: utils.parseEther('1'),
      minInvestmentAmount: utils.parseEther('0'),
      minMaxInvestmentPolicy,
    });

    {
      // Only the investmentAmount arg matters for this policy
      const postBuySharesArgs = validateRulePostBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('1.5'),
        sharesIssued: 1,
      });

      const validateRuleCall = await minMaxInvestmentPolicy.validateRule
        .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
        .call();

      expect(validateRuleCall).toBe(false);
    }

    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('0.5'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestmentPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('correctly handles when maxInvestmentAmount equals to 0', async () => {
    await addFundSettings({
      comptrollerProxy,
      maxInvestmentAmount: utils.parseEther('0'),
      minInvestmentAmount: utils.parseEther('1'),
      minMaxInvestmentPolicy,
    });

    {
      // Only the investmentAmount arg matters for this policy
      const postBuySharesArgs = validateRulePostBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('0.5'),
        sharesIssued: 1,
      });

      const validateRuleCall = await minMaxInvestmentPolicy.validateRule
        .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
        .call();

      expect(validateRuleCall).toBe(false);
    }

    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1.5'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestmentPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });
});
