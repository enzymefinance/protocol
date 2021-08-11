import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  AllowedDepositRecipients,
  allowedDepositRecipientsArgs,
  PolicyHook,
  validateRulePostBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

async function addFundSettings({
  comptrollerProxy,
  allowedDepositRecipients,
  investorsToAdd,
}: {
  comptrollerProxy: AddressLike;
  allowedDepositRecipients: AllowedDepositRecipients;
  investorsToAdd: AddressLike[];
}) {
  const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
    investorsToAdd,
  });

  await allowedDepositRecipients.addFundSettings(comptrollerProxy, allowedDepositRecipientsConfig);
}

async function deployAndConfigureStandaloneAllowedDepositRecipients(
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

  let allowedDepositRecipients = await AllowedDepositRecipients.deploy(fork.deployer, EOAPolicyManager);
  allowedDepositRecipients = allowedDepositRecipients.connect(EOAPolicyManager);

  if (comptrollerProxy != '0x') {
    await addFundSettings({
      comptrollerProxy,
      allowedDepositRecipients,
      investorsToAdd,
    });
  }

  return allowedDepositRecipients;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedDepositRecipients = fork.deployment.allowedDepositRecipients;

    const getPolicyManagerCall = await allowedDepositRecipients.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await allowedDepositRecipients.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(allowedDepositRecipients.implementedHooks.fragment, [
      PolicyHook.PostBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let allowedInvestors: AddressLike[];
  let allowedDepositRecipients: AllowedDepositRecipients;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    allowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipients = await deployAndConfigureStandaloneAllowedDepositRecipients(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToAdd: allowedInvestors,
    });

    await expect(
      allowedDepositRecipients.connect(randomUser).addFundSettings(comptrollerProxy, allowedDepositRecipientsConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToAdd: allowedInvestors,
    });

    const receipt = await allowedDepositRecipients.addFundSettings(comptrollerProxy, allowedDepositRecipientsConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: allowedInvestors,
    });

    // List should be the allowed investors
    const getListCall = await allowedDepositRecipients.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipients.getList, allowedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('canDisable', () => {
  it('returns true', async () => {
    const fork = await deployProtocolFixture();
    const allowedDepositRecipients = await deployAndConfigureStandaloneAllowedDepositRecipients(fork, {});

    expect(await allowedDepositRecipients.canDisable()).toBe(true);
  });
});

describe('updateFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let currentAllowedInvestors: AddressLike[];
  let allowedDepositRecipients: AllowedDepositRecipients;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    currentAllowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipients = await deployAndConfigureStandaloneAllowedDepositRecipients(fork, {
      comptrollerProxy,
      investorsToAdd: currentAllowedInvestors,
    });
  });

  it('can only be called by the policy manager', async () => {
    const [randomUser] = fork.accounts;

    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      allowedDepositRecipients.connect(randomUser).updateFundSettings(comptrollerProxy, allowedDepositRecipientsConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const investorsToAdd = [randomAddress(), randomAddress()];

    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToAdd,
    });

    const receipt = await allowedDepositRecipients.updateFundSettings(comptrollerProxy, allowedDepositRecipientsConfig);

    currentAllowedInvestors = currentAllowedInvestors.concat(investorsToAdd);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous allowed investors and new investors
    const getListCall = await allowedDepositRecipients.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipients.getList, currentAllowedInvestors);
  });

  it('correctly handles removing items only', async () => {
    const [investorToRemove] = currentAllowedInvestors;

    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await allowedDepositRecipients.updateFundSettings(comptrollerProxy, allowedDepositRecipientsConfig);

    currentAllowedInvestors[0] = currentAllowedInvestors[currentAllowedInvestors.length - 1];
    currentAllowedInvestors = currentAllowedInvestors.slice(0, -1);

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously allowed investors
    const getListCall = await allowedDepositRecipients.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipients.getList, currentAllowedInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const [investorToRemove, ...remainingInvestors] = currentAllowedInvestors;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newInvestor = randomAddress();
    const overlappingInvestor = randomAddress();
    const investorsToAdd = [newInvestor, overlappingInvestor];
    const investorsToRemove = [investorToRemove, overlappingInvestor];

    const allowedDepositRecipientsConfig = allowedDepositRecipientsArgs({
      investorsToAdd,
      investorsToRemove,
    });

    await allowedDepositRecipients.updateFundSettings(comptrollerProxy, allowedDepositRecipientsConfig);

    currentAllowedInvestors = [newInvestor, ...remainingInvestors];

    // Final list should have removed one investor and added one investor
    const getListCall = await allowedDepositRecipients.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(allowedDepositRecipients.getList, currentAllowedInvestors);
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let allowedInvestors: AddressLike[];
  let allowedDepositRecipients: AllowedDepositRecipients;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    allowedInvestors = [randomAddress(), randomAddress()];

    allowedDepositRecipients = await deployAndConfigureStandaloneAllowedDepositRecipients(fork, {
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

    const validateRuleCall = await allowedDepositRecipients.validateRule
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

    const validateRuleCall = await allowedDepositRecipients.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
