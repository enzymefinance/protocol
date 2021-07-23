import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  InvestorWhitelist,
  investorWhitelistArgs,
  PolicyHook,
  validateRulePostBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

async function addFundSettings({
  comptrollerProxy,
  investorWhitelist,
  investorsToAdd,
}: {
  comptrollerProxy: AddressLike;
  investorWhitelist: InvestorWhitelist;
  investorsToAdd: AddressLike[];
}) {
  const investorWhitelistConfig = investorWhitelistArgs({
    investorsToAdd,
  });

  await investorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);
}

async function deployAndConfigureStandaloneInvestorWhitelist(
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

  let investorWhitelist = await InvestorWhitelist.deploy(fork.deployer, EOAPolicyManager);
  investorWhitelist = investorWhitelist.connect(EOAPolicyManager);

  if (comptrollerProxy != '0x') {
    await addFundSettings({
      comptrollerProxy,
      investorWhitelist,
      investorsToAdd,
    });
  }

  return investorWhitelist;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const investorWhitelist = fork.deployment.investorWhitelist;

    const getPolicyManagerCall = await investorWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await investorWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(investorWhitelist.implementedHooks.fragment, [
      PolicyHook.PostBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let whitelistedInvestors: AddressLike[];
  let investorWhitelist: InvestorWhitelist;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    whitelistedInvestors = [randomAddress(), randomAddress()];

    investorWhitelist = await deployAndConfigureStandaloneInvestorWhitelist(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    await expect(
      investorWhitelist.connect(randomUser).addFundSettings(comptrollerProxy, investorWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    const receipt = await investorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedInvestors,
    });

    // List should be the whitelisted investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(investorWhitelist.getList, whitelistedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('canDisable', () => {
  it('returns true', async () => {
    const fork = await deployProtocolFixture();
    const investorWhitelist = await deployAndConfigureStandaloneInvestorWhitelist(fork, {});

    expect(await investorWhitelist.canDisable()).toBe(true);
  });
});

describe('updateFundSettings', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let currentWhitelistedInvestors: AddressLike[];
  let investorWhitelist: InvestorWhitelist;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    currentWhitelistedInvestors = [randomAddress(), randomAddress()];

    investorWhitelist = await deployAndConfigureStandaloneInvestorWhitelist(fork, {
      comptrollerProxy,
      investorsToAdd: currentWhitelistedInvestors,
    });
  });

  it('can only be called by the policy manager', async () => {
    const [randomUser] = fork.accounts;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      investorWhitelist.connect(randomUser).updateFundSettings(comptrollerProxy, investorWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const investorsToAdd = [randomAddress(), randomAddress()];

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
    });

    const receipt = await investorWhitelist.updateFundSettings(comptrollerProxy, investorWhitelistConfig);

    currentWhitelistedInvestors = currentWhitelistedInvestors.concat(investorsToAdd);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous whitelisted investors and new investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(investorWhitelist.getList, currentWhitelistedInvestors);
  });

  it('correctly handles removing items only', async () => {
    const [investorToRemove] = currentWhitelistedInvestors;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await investorWhitelist.updateFundSettings(comptrollerProxy, investorWhitelistConfig);

    currentWhitelistedInvestors[0] = currentWhitelistedInvestors[currentWhitelistedInvestors.length - 1];
    currentWhitelistedInvestors = currentWhitelistedInvestors.slice(0, -1);

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously whitelisted investors
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(investorWhitelist.getList, currentWhitelistedInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const [investorToRemove, ...remainingInvestors] = currentWhitelistedInvestors;

    // If an address is in both add and remove arrays, they should not be in the final list.
    // We do not currently check for uniqueness between the two arrays for efficiency.
    const newInvestor = randomAddress();
    const overlappingInvestor = randomAddress();
    const investorsToAdd = [newInvestor, overlappingInvestor];
    const investorsToRemove = [investorToRemove, overlappingInvestor];

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
      investorsToRemove,
    });

    await investorWhitelist.updateFundSettings(comptrollerProxy, investorWhitelistConfig);

    currentWhitelistedInvestors = [newInvestor, ...remainingInvestors];

    // Final list should have removed one investor and added one investor
    const getListCall = await investorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(investorWhitelist.getList, currentWhitelistedInvestors);
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let comptrollerProxy: AddressLike;
  let whitelistedInvestors: AddressLike[];
  let investorWhitelist: InvestorWhitelist;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    comptrollerProxy = randomAddress();
    whitelistedInvestors = [randomAddress(), randomAddress()];

    investorWhitelist = await deployAndConfigureStandaloneInvestorWhitelist(fork, {
      comptrollerProxy,
      investorsToAdd: whitelistedInvestors,
    });
  });

  it('returns true if an investor is in the whitelist', async () => {
    // Only the buyer arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: whitelistedInvestors[0], // good buyer
      fundGav: 0,
      investmentAmount: 1,
      sharesIssued: 1,
    });

    const validateRuleCall = await investorWhitelist.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an investor is not in the whitelist', async () => {
    // Only the buyer arg matters for this policy
    const postBuySharesArgs = validateRulePostBuySharesArgs({
      buyer: randomAddress(), // bad buyer
      fundGav: 0,
      investmentAmount: 1,
      sharesIssued: 1,
    });

    const validateRuleCall = await investorWhitelist.validateRule
      .args(comptrollerProxy, PolicyHook.PostBuyShares, postBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
