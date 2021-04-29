import { randomAddress } from '@enzymefinance/ethers';
import {
  InvestorWhitelist,
  investorWhitelistArgs,
  PolicyHook,
  validateRulePreBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';

async function snapshot() {
  const { deployer, accounts, deployment, config } = await deployProtocolFixture();

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const comptrollerProxy = randomAddress();
  const whitelistedInvestors = [randomAddress(), randomAddress()];

  const investorWhitelist1 = await InvestorWhitelist.deploy(deployer, EOAPolicyManager);
  const permissionedInvestorWhitelist = investorWhitelist1.connect(EOAPolicyManager);

  const investorWhitelist2 = await InvestorWhitelist.deploy(deployer, EOAPolicyManager);
  const configuredInvestorWhitelist = investorWhitelist2.connect(EOAPolicyManager);

  const investorWhitelistConfig = investorWhitelistArgs({
    investorsToAdd: whitelistedInvestors,
  });

  await configuredInvestorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    comptrollerProxy,
    config,
    configuredInvestorWhitelist,
    deployment,
    permissionedInvestorWhitelist,
    whitelistedInvestors,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, investorWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await investorWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await investorWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PreBuyShares]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { investorWhitelist },
      comptrollerProxy,
      whitelistedInvestors,
    } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    await expect(investorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { comptrollerProxy, permissionedInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: whitelistedInvestors,
    });

    const receipt = await permissionedInvestorWhitelist.addFundSettings(comptrollerProxy, investorWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: whitelistedInvestors,
    });

    // List should be the whitelisted investors
    const getListCall = await permissionedInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(permissionedInvestorWhitelist.getList, whitelistedInvestors);
  });

  it.todo('handles a valid call (re-enabled policy)');
});

describe('updateFundSettings', () => {
  it('can only be called by the policy manager', async () => {
    const {
      deployment: { investorWhitelist },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd: [randomAddress()],
    });

    await expect(
      investorWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('correctly handles adding items only', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const investorsToAdd = [randomAddress(), randomAddress()];
    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToAdd,
    });

    const receipt = await configuredInvestorWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      investorWhitelistConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy,
      items: investorsToAdd,
    });

    // List should include both previous whitelisted investors and new investors
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(
      configuredInvestorWhitelist.getList,
      whitelistedInvestors.concat(investorsToAdd),
    );
  });

  it('correctly handles removing items only', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

    const investorWhitelistConfig = investorWhitelistArgs({
      investorsToRemove: [investorToRemove],
    });

    const receipt = await configuredInvestorWhitelist.updateFundSettings(
      comptrollerProxy,
      randomAddress(),
      investorWhitelistConfig,
    );

    // Assert the AddressesRemoved event was emitted
    assertEvent(receipt, 'AddressesRemoved', {
      comptrollerProxy,
      items: [investorToRemove],
    });

    // List should remove investor from previously whitelisted investors
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredInvestorWhitelist.getList, remainingInvestors);
  });

  it('correctly handles both adding and removing items', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    const [investorToRemove, ...remainingInvestors] = whitelistedInvestors;

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

    await configuredInvestorWhitelist.updateFundSettings(comptrollerProxy, randomAddress(), investorWhitelistConfig);

    // Final list should have removed one investor and added one investor
    const getListCall = await configuredInvestorWhitelist.getList(comptrollerProxy);
    expect(getListCall).toMatchFunctionOutput(configuredInvestorWhitelist.getList, [
      newInvestor,
      ...remainingInvestors,
    ]);
  });
});

describe('validateRule', () => {
  it('returns true if an investor is in the whitelist', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist, whitelistedInvestors } = await provider.snapshot(snapshot);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: whitelistedInvestors[0], // good buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await configuredInvestorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an investor is not in the whitelist', async () => {
    const { comptrollerProxy, configuredInvestorWhitelist } = await provider.snapshot(snapshot);

    // Only the buyer arg matters for this policy
    const preBuySharesArgs = validateRulePreBuySharesArgs({
      buyer: randomAddress(), // bad buyer
      fundGav: 0,
      investmentAmount: 1,
      minSharesQuantity: 1,
    });

    const validateRuleCall = await configuredInvestorWhitelist.validateRule
      .args(comptrollerProxy, randomAddress(), PolicyHook.PreBuyShares, preBuySharesArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
