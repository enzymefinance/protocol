import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  AllowedDepositRecipientsPolicy,
  allowedDepositRecipientsPolicyArgs,
  PolicyHook,
  validateRulePostBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

async function addFundSettings({
  comptrollerProxy,
  allowedDepositRecipientsPolicy,
  investorsToAdd,
}: {
  comptrollerProxy: AddressLike;
  allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;
  investorsToAdd: AddressLike[];
}) {
  const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
    investorsToAdd,
  });

  await allowedDepositRecipientsPolicy.addFundSettings(comptrollerProxy, allowedDepositRecipientsPolicyConfig);
}

async function deployAndConfigureStandaloneAllowedDepositRecipientsPolicy(
  fork: ProtocolDeployment,
  {
    comptrollerProxy = '0x',
    investorsToAdd = [],
  }: {
    comptrollerProxy?: AddressLike;
    investorsToAdd?: AddressLike[];
  },
) {
  const [EOAPolicyManager] = fork.accounts.slice(-1);

  let allowedDepositRecipientsPolicy = await AllowedDepositRecipientsPolicy.deploy(fork.deployer, EOAPolicyManager);
  allowedDepositRecipientsPolicy = allowedDepositRecipientsPolicy.connect(EOAPolicyManager);

  if (comptrollerProxy != '0x') {
    await addFundSettings({
      comptrollerProxy,
      allowedDepositRecipientsPolicy,
      investorsToAdd,
    });
  }

  return allowedDepositRecipientsPolicy;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;

    const getPolicyManagerCall = await allowedDepositRecipientsPolicy.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await allowedDepositRecipientsPolicy.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(allowedDepositRecipientsPolicy.implementedHooks.fragment, [
      PolicyHook.PostBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let allowedInvestors: AddressLike[];
  let allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    allowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipientsPolicy = await deployAndConfigureStandaloneAllowedDepositRecipientsPolicy(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToAdd: allowedInvestors,
    });

    await expect(
      allowedDepositRecipientsPolicy
        .connect(randomUser)
        .addFundSettings(comptrollerProxy, allowedDepositRecipientsPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToAdd: allowedInvestors,
    });

    const receipt = await allowedDepositRecipientsPolicy.addFundSettings(
      comptrollerProxy,
      allowedDepositRecipientsPolicyConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: allowedInvestors,
    });

    // List should be the allowed investors
    const getListCall = await allowedDepositRecipientsPolicy.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipientsPolicy.getList, allowedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('canDisable', () => {
  it('returns true', async () => {
    const fork = await deployProtocolFixture();
    const allowedDepositRecipientsPolicy = await deployAndConfigureStandaloneAllowedDepositRecipientsPolicy(fork, {});

    expect(await allowedDepositRecipientsPolicy.canDisable()).toBe(true);
  });
});

describe('updateFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let currentAllowedInvestors: AddressLike[];
  let allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    currentAllowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipientsPolicy = await deployAndConfigureStandaloneAllowedDepositRecipientsPolicy(fork, {
      comptrollerProxy,
      investorsToAdd: currentAllowedInvestors,
    });
  });

  it('can only be called by the policy manager', async () => {
    const [randomUser] = fork.accounts;

    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      allowedDepositRecipientsPolicy
        .connect(randomUser)
        .updateFundSettings(comptrollerProxy, allowedDepositRecipientsPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const investorsToAdd = [randomAddress(), randomAddress()];

    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToAdd,
    });

    const receipt = await allowedDepositRecipientsPolicy.updateFundSettings(
      comptrollerProxy,
      allowedDepositRecipientsPolicyConfig,
    );

    currentAllowedInvestors = currentAllowedInvestors.concat(investorsToAdd);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous allowed investors and new investors
    const getListCall = await allowedDepositRecipientsPolicy.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipientsPolicy.getList, currentAllowedInvestors);
  });

  it('correctly handles removing items only', async () => {
    const [investorToRemove] = currentAllowedInvestors;

    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await allowedDepositRecipientsPolicy.updateFundSettings(
      comptrollerProxy,
      allowedDepositRecipientsPolicyConfig,
    );

    currentAllowedInvestors[0] = currentAllowedInvestors[currentAllowedInvestors.length - 1];
    currentAllowedInvestors = currentAllowedInvestors.slice(0, -1);

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously allowed investors
    const getListCall = await allowedDepositRecipientsPolicy.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipientsPolicy.getList, currentAllowedInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const [investorToRemove, ...remainingInvestors] = currentAllowedInvestors;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newInvestor = randomAddress();
    const overlappingInvestor = randomAddress();
    const investorsToAdd = [newInvestor, overlappingInvestor];
    const investorsToRemove = [investorToRemove, overlappingInvestor];

    const allowedDepositRecipientsPolicyConfig = allowedDepositRecipientsPolicyArgs({
      investorsToAdd,
      investorsToRemove,
    });

    await allowedDepositRecipientsPolicy.updateFundSettings(comptrollerProxy, allowedDepositRecipientsPolicyConfig);

    currentAllowedInvestors = [newInvestor, ...remainingInvestors];

    // Final list should have removed one investor and added one investor
    const getListCall = await allowedDepositRecipientsPolicy.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipientsPolicy.getList, currentAllowedInvestors);
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let allowedInvestors: AddressLike[];
  let allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    allowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipientsPolicy = await deployAndConfigureStandaloneAllowedDepositRecipientsPolicy(fork, {
      comptrollerProxy,
      investorsToAdd: allowedInvestors,
    });
  });

  it('returns true if an investor is allowed', async () => {
    // Only the buyer arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: allowedInvestors[0], // good buyer
      fundGav: 0,
      investmentAmount: 1,
      sharesIssued: 1,
    });

    const validateRuleCall = await allowedDepositRecipientsPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an investor is not allowed', async () => {
    // Only the buyer arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(), // bad buyer
      fundGav: 0,
      investmentAmount: 1,
      sharesIssued: 1,
    });

    const validateRuleCall = await allowedDepositRecipientsPolicy.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
