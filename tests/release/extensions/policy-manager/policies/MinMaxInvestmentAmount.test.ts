import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  MinMaxInvestment,
  minMaxInvestmentArgs,
  PolicyHook,
  validateRulePostBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { BigNumberish, utils } from 'ethers';

async function addFundSettings({
  comptrollerProxy,
  minMaxInvestment,
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  comptrollerProxy: AddressLike;
  minMaxInvestment: MinMaxInvestment;
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  const minMaxInvestmentConfig = minMaxInvestmentArgs({
    minInvestmentAmount,
    maxInvestmentAmount,
  });

  await minMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig);
}

async function updateFundSettings({
  comptrollerProxy,
  minMaxInvestment,
  minInvestmentAmount,
  maxInvestmentAmount,
}: {
  comptrollerProxy: AddressLike;
  minMaxInvestment: MinMaxInvestment;
  minInvestmentAmount: BigNumberish;
  maxInvestmentAmount: BigNumberish;
}) {
  const minMaxInvestmentConfig = minMaxInvestmentArgs({
    minInvestmentAmount,
    maxInvestmentAmount,
  });

  await minMaxInvestment.updateFundSettings(comptrollerProxy, minMaxInvestmentConfig);
}

async function deployAndConfigureStandaloneMinMaxInvestment(
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

  let minMaxInvestment = await MinMaxInvestment.deploy(fork.deployer, EOAPolicyManager);
  minMaxInvestment = minMaxInvestment.connect(EOAPolicyManager);

  if (comptrollerProxy != '0x') {
    await addFundSettings({
      comptrollerProxy,
      minMaxInvestment,
      minInvestmentAmount,
      maxInvestmentAmount,
    });
  }
  return minMaxInvestment;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const minMaxInvestment = fork.deployment.minMaxInvestment;

    const getPolicyManagerCall = await minMaxInvestment.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await minMaxInvestment.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PostBuyShares]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestment: MinMaxInvestment;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestment = await deployAndConfigureStandaloneMinMaxInvestment(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    await expect(
      minMaxInvestment.connect(randomUser).addFundSettings(comptrollerProxy, minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    {
      const minMaxInvestmentConfig = minMaxInvestmentArgs({
        minInvestmentAmount: utils.parseEther('1'),
        maxInvestmentAmount: utils.parseEther('1'),
      });

      await expect(minMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig)).rejects.toBeRevertedWith(
        'minInvestmentAmount must be less than maxInvestmentAmount',
      );
    }

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('2'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    await expect(minMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig)).rejects.toBeRevertedWith(
      'minInvestmentAmount must be less than maxInvestmentAmount',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const minInvestmentAmount = utils.parseEther('1');
    const maxInvestmentAmount = utils.parseEther('2');

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const receipt = await minMaxInvestment.addFundSettings(comptrollerProxy, minMaxInvestmentConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const fundSettings = await minMaxInvestment.getFundSettings(comptrollerProxy);

    expect(fundSettings).toMatchFunctionOutput(minMaxInvestment.getFundSettings, {
      minInvestmentAmount,
      maxInvestmentAmount,
    });
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    const fork = await deployProtocolFixture();
    const minMaxInvestment = await deployAndConfigureStandaloneMinMaxInvestment(fork, {});

    expect(await minMaxInvestment.canDisable()).toBe(true);
  });
});

describe('updateFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestment: MinMaxInvestment;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestment = await deployAndConfigureStandaloneMinMaxInvestment(fork, {});
  });

  it('can only be called by the policy manager', async () => {
    const [randomUser] = fork.accounts;

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
    });

    await expect(
      minMaxInvestment.connect(randomUser).updateFundSettings(comptrollerProxy, minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    {
      const minMaxInvestmentConfig = minMaxInvestmentArgs({
        minInvestmentAmount: utils.parseEther('1'),
        maxInvestmentAmount: utils.parseEther('1'),
      });

      await expect(
        minMaxInvestment.updateFundSettings(comptrollerProxy, minMaxInvestmentConfig),
      ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
    }
    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount: utils.parseEther('2'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    await expect(
      minMaxInvestment.updateFundSettings(comptrollerProxy, minMaxInvestmentConfig),
    ).rejects.toBeRevertedWith('minInvestmentAmount must be less than maxInvestmentAmount');
  });

  it('updates config values for fund and fires events', async () => {
    const minInvestmentAmount = utils.parseEther('3');
    const maxInvestmentAmount = utils.parseEther('4');

    const minMaxInvestmentConfig = minMaxInvestmentArgs({
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const receipt = await minMaxInvestment.updateFundSettings(comptrollerProxy, minMaxInvestmentConfig);

    assertEvent(receipt, 'FundSettingsSet', {
      comptrollerProxy,
      minInvestmentAmount,
      maxInvestmentAmount,
    });

    const fundSettings = await minMaxInvestment.getFundSettings(comptrollerProxy);
    expect(fundSettings).toMatchFunctionOutput(minMaxInvestment.getFundSettings, {
      minInvestmentAmount,
      maxInvestmentAmount,
    });
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let minMaxInvestment: MinMaxInvestment;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    minMaxInvestment = await deployAndConfigureStandaloneMinMaxInvestment(fork, {
      comptrollerProxy,
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('2'),
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

    const validateRuleCall = await minMaxInvestment.validateRule
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

    const validateRuleCall = await minMaxInvestment.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('returns false if both the minInvestmentAmount and maxInvestmentAmount equal to 0 (can be used to temporarily close the fund) unless investmentAmount is 0', async () => {
    await updateFundSettings({
      comptrollerProxy,
      minMaxInvestment,
      minInvestmentAmount: utils.parseEther('0'),
      maxInvestmentAmount: utils.parseEther('0'),
    });

    // Only the investmentAmount arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(),
      fundGav: 0,
      investmentAmount: utils.parseEther('1'),
      sharesIssued: 1,
    });

    const validateRuleCall = await minMaxInvestment.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });

  it('correctly handles when minInvestmentAmount equals to 0', async () => {
    await updateFundSettings({
      comptrollerProxy,
      minMaxInvestment,
      minInvestmentAmount: utils.parseEther('0'),
      maxInvestmentAmount: utils.parseEther('1'),
    });

    {
      // Only the investmentAmount arg matters for this policy
      const postBuySharesArgs = validateRulePostBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('1.5'),
        sharesIssued: 1,
      });

      const validateRuleCall = await minMaxInvestment.validateRule
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

    const validateRuleCall = await minMaxInvestment.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('correctly handles when maxInvestmentAmount equals to 0', async () => {
    await addFundSettings({
      comptrollerProxy,
      minMaxInvestment,
      minInvestmentAmount: utils.parseEther('1'),
      maxInvestmentAmount: utils.parseEther('0'),
    });

    {
      // Only the investmentAmount arg matters for this policy
      const postBuySharesArgs = validateRulePostBuySharesArgs({
        buyer: randomAddress(),
        fundGav: 0,
        investmentAmount: utils.parseEther('0.5'),
        sharesIssued: 1,
      });

      const validateRuleCall = await minMaxInvestment.validateRule
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

    const validateRuleCall = await minMaxInvestment.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });
});
