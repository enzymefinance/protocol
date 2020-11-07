import { utils } from 'ethers';
import { EthereumTestnetProvider, extractEvent } from '@crestproject/crestproject';
import {
  IPolicy,
  PolicyHook,
  policyManagerConfigArgs,
  validateRulePostBuySharesArgs,
  validateRulePostCoIArgs,
  validateRulePreBuySharesArgs,
  validateRulePreCoIArgs,
} from '@melonproject/protocol';
import {
  defaultTestDeployment,
  buyShares,
  createNewFund,
  generateRegisteredMockPolicies,
  mockGenericSwap,
  mockGenericSwapASelector,
  assertEvent,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const policies = await generateRegisteredMockPolicies({
    deployer: config.deployer,
    policyManager: deployment.policyManager,
  });

  const orderedPolicies = Object.values(policies);
  const policiesSettingsData = [utils.randomBytes(10), '0x', utils.randomBytes(2), '0x'];

  const policyManagerConfig = policyManagerConfigArgs({
    policies: orderedPolicies,
    settings: policiesSettingsData,
  });

  const denominationAsset = deployment.tokens.weth;

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    policies,
    orderedPolicies,
    policiesSettingsData,
    policyManagerConfig,
    denominationAsset,
    fundOwner,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        adapterBlacklist,
        adapterWhitelist,
        assetBlacklist,
        assetWhitelist,
        fundDeployer,
        maxConcentration,
        policyManager,
        investorWhitelist,
      },
      policies,
    } = await provider.snapshot(snapshot);

    const result = await policyManager.getRegisteredPolicies();
    expect(result).toMatchFunctionOutput(policyManager.getRegisteredPolicies, [
      adapterBlacklist,
      adapterWhitelist,
      assetBlacklist,
      assetWhitelist,
      maxConcentration,
      investorWhitelist,
      ...Object.values(policies),
    ]);

    const policyManagerOwner = await policyManager.getOwner();
    const fundDeployerOwner = await fundDeployer.getOwner();
    expect(policyManagerOwner).toMatchAddress(fundDeployerOwner);
  });

  it.todo('[check policyImplementsHook() against each policy above]');
});

describe('activateForFund', () => {
  it.todo('stores the validated VaultProxy and calls `activateForFund()` on each policy (migrated fund only)');
});

describe('deactivateForFund', () => {
  it.todo('removes VaultProxy and all policies from local storage');
});

describe('disablePolicyForFund', () => {
  it.todo('does not allow a random caller');

  it.todo('does not allow an un-enabled policy');

  it.todo('does not allow a policy that implements a non-BuyShares hook');

  it.todo('removes specified policies and emits an event for each');
});

describe('enablePolicyForFund', () => {
  it.todo('does not allow a random caller');

  it.todo('does not allow a policy that implements a non-BuyShares hook');

  it.todo('does not allow an already enabled policy');

  it.todo('does not allow an unregistered policy');

  it.todo(
    'adds specified policies, calls `addFundSettings` and `activateForFund` on each with the correct params, and emits an event for each',
  );

  it.todo(
    'Policy with no settings: adds the policy and emits an event, does NOT call `addFundSettings()` on fee but DOES call `activateForFund`',
  );
});

describe('setConfigForFund', () => {
  it.todo('does not allow unequal policies and settingsData array lengths');

  it.todo('does not allow an already enabled policy');

  it.todo('does not allow unregistered policies');

  it('adds specified policies, calls `addFundSettings` on each with the correct params, and emits an event for each', async () => {
    const {
      deployment: { fundDeployer, policyManager },
      fundOwner,
      denominationAsset,
      orderedPolicies,
      policiesSettingsData,
      policyManagerConfig,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      policyManagerConfig,
    });

    // Assert state for fund
    const enabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy);

    expect(enabledPolicies).toMatchFunctionOutput(policyManager.getEnabledPoliciesForFund, orderedPolicies);

    // Assert addFundSettings was called on each policy with its settingsData,
    // only if settingsData was passed
    for (const key in orderedPolicies) {
      if (policiesSettingsData[key] === '0x') {
        expect(orderedPolicies[key].addFundSettings).not.toHaveBeenCalledOnContract();
      } else {
        expect(orderedPolicies[key].addFundSettings).toHaveBeenCalledOnContractWith(
          comptrollerProxy,
          policiesSettingsData[key],
        );
      }
    }

    // Assert PolicyEnabledForFund events
    const policyEnabledForFundEvent = policyManager.abi.getEvent('PolicyEnabledForFund');

    const events = extractEvent(receipt, policyEnabledForFundEvent);
    expect(events.length).toBe(orderedPolicies.length);
    for (let i = 0; i < orderedPolicies.length; i++) {
      expect(events[i]).toMatchEventArgs({
        comptrollerProxy: comptrollerProxy.address,
        policy: orderedPolicies[i].address,
        settingsData: utils.hexlify(policiesSettingsData[i]),
      });
    }
  });

  it.todo('Policy with no settings: adds the policy and emits an event, does NOT call `addFundSettings()`');
});

describe('updatePolicySettingsForFund', () => {
  it.todo('does not allow a random caller');

  it.todo('does not allow a policy that implements a non-BuyShares hook');

  it.todo('does not allow an un-enabled policy');

  it.todo('calls `updateFundSettings` on the policy with the correct params');
});

describe('validatePolicies', () => {
  it('correctly handles a BuyShares PolicyHook', async () => {
    const {
      accounts: [buyer],
      policies: { mockPreBuySharesPolicy, mockPostBuySharesPolicy, mockPreCoIPolicy, mockPostCoIPolicy },
      deployment: { fundDeployer },
      fundOwner,
      denominationAsset,
      policyManagerConfig,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      policyManagerConfig,
    });

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert validateRule called on correct policies
    const preRuleArgs = validateRulePreBuySharesArgs({
      buyer,
      investmentAmount,
      minSharesQuantity: investmentAmount,
      fundGav: 0, // No investments have been made yet, so gav is 0
    });

    expect(mockPreBuySharesPolicy.validateRule).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      PolicyHook.PreBuyShares,
      preRuleArgs,
    );

    expect(mockPostBuySharesPolicy.validateRule).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      PolicyHook.PostBuyShares,
      validateRulePostBuySharesArgs({
        investmentAmount,
        sharesBought: investmentAmount,
        buyer,
      }),
    );

    // Assert validateRule not called on other policies
    expect(mockPreCoIPolicy.validateRule).not.toHaveBeenCalledOnContract();
    expect(mockPostCoIPolicy.validateRule).not.toHaveBeenCalledOnContract();
  });

  it('correctly handles a CallOnIntegration PolicyHook', async () => {
    const {
      deployment: {
        fundDeployer,
        integrationManager,
        mockGenericAdapter,
        tokens: { dai, mln, weth },
      },
      policies: { mockPreBuySharesPolicy, mockPostBuySharesPolicy, mockPreCoIPolicy, mockPostCoIPolicy },
      fundOwner,
      denominationAsset,
      policyManagerConfig,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      policyManagerConfig,
    });

    // Define complex spend and incoming asset values to ensure correct data passed to PolicyManager
    const spendAssets = [weth, dai];
    const spendAssetAmounts = [utils.parseEther('1'), utils.parseEther('1')];
    const incomingAssets = [dai, mln];
    const minIncomingAssetAmounts = [1234, 5678];

    // Since `mockGenericSwap` seeds funds by sending directly to a vault,
    // the incoming assets are not yet tracked, meaning the final token balance
    // will be the reported incoming asset amount
    // (rather than the diff in token balances from start to finish)
    const actualIncomingAssetAmounts = [utils.parseEther('10'), utils.parseEther('2')];

    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets,
      spendAssetAmounts,
      incomingAssets,
      minIncomingAssetAmounts,
      actualIncomingAssetAmounts,
      seedFund: true,
    });

    // Assert validateRule called on correct policies
    expect(mockPreCoIPolicy.validateRule).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      PolicyHook.PreCallOnIntegration,
      validateRulePreCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
      }),
    );

    // Outgoing assets are the spend assets that are not also incoming assets
    const outgoingAssets = [weth];
    const outgoingAssetAmounts = [utils.parseEther('1')];

    expect(mockPostCoIPolicy.validateRule).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      PolicyHook.PostCallOnIntegration,
      validateRulePostCoIArgs({
        adapter: mockGenericAdapter,
        selector: mockGenericSwapASelector,
        incomingAssets,
        incomingAssetAmounts: actualIncomingAssetAmounts,
        outgoingAssets,
        outgoingAssetAmounts,
      }),
    );

    // Assert validateRule not called on other policies
    expect(mockPreBuySharesPolicy.validateRule).not.toHaveBeenCalledOnContract();
    expect(mockPostBuySharesPolicy.validateRule).not.toHaveBeenCalledOnContract();
  });

  it('reverts if return value is false', async () => {
    const {
      deployment: { fundDeployer, integrationManager, mockGenericAdapter },
      policies: { mockPreCoIPolicy },
      fundOwner,
      denominationAsset,
      policyManagerConfig,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      policyManagerConfig,
    });

    // Set policy to return validateRule as false
    await mockPreCoIPolicy.validateRule.returns(false);

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false');
  });
});

describe('policy registry', () => {
  describe('deregisterPolicies', () => {
    it.todo('can only be called by the owner of the FundDeployer contract');

    it.todo('does not allow empty _policies param');

    it.todo('does not allow an unregistered policy');

    it.todo('successfully de-registers multiple policies and emits one event per policy');
  });

  describe('registerPolicies', () => {
    it.todo('can only be called by the owner of the FundDeployer contract');

    it.todo('does not allow empty _policies param');

    it.todo('does not allow an already registered policy');

    it('successfully registers a policy with multiple implemented hooks and emits the correct event', async () => {
      const {
        config: { deployer },
        deployment: { policyManager },
      } = await provider.snapshot(snapshot);

      // Setup a mock policy that implements multiple hooks
      const identifier = `MOCK_POLICY`;
      const hooks = [PolicyHook.PreBuyShares, PolicyHook.PreCallOnIntegration];
      const notIncludedHooks = [PolicyHook.PostBuyShares, PolicyHook.PostCallOnIntegration];
      const mockPolicy = await IPolicy.mock(deployer);
      await mockPolicy.identifier.returns(identifier);
      await mockPolicy.implementedHooks.returns(hooks);

      const receipt = await policyManager.registerPolicies([mockPolicy]);

      // Assert event
      assertEvent(receipt, 'PolicyRegistered', {
        policy: mockPolicy,
        implementedHooks: hooks,
        // TODO: Improve param matching to automatically derive the sighash for indexed event args.
        identifier: expect.objectContaining({
          hash: utils.id(identifier),
        }),
      });

      // Policies should be registered
      const registeredPolicies = await policyManager.getRegisteredPolicies();
      expect(registeredPolicies).toMatchFunctionOutput(
        policyManager.getRegisteredPolicies.fragment,
        expect.arrayContaining([mockPolicy.address]),
      );

      // Policy hooks should be stored
      for (const hook of hooks) {
        const goodPolicyImplementsHookCall = await policyManager.policyImplementsHook(mockPolicy, hook);

        expect(goodPolicyImplementsHookCall).toBe(true);
      }

      for (const hook of notIncludedHooks) {
        const badPolicyImplementsHookCall = await policyManager.policyImplementsHook(mockPolicy, hook);

        expect(badPolicyImplementsHookCall).toBe(false);
      }
    });
  });
});
