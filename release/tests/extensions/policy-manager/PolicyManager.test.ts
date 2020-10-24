import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  extractEvent,
} from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../../';
import { IPolicy } from '../../../codegen/IPolicy';
import {
  buyShares,
  createNewFund,
  encodeArgs,
  generateRegisteredMockPolicies,
  mockGenericSwap,
  mockGenericSwapASelector,
  validateRulePreBuySharesArgs,
  validateRulePostBuySharesArgs,
  validateRulePreCoIArgs,
  validateRulePostCoIArgs,
  policyHooks,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const policies = await generateRegisteredMockPolicies({
    deployer: config.deployer,
    policyManager: deployment.policyManager,
  });

  const policiesSettingsData = [
    utils.randomBytes(10),
    '0x',
    utils.randomBytes(2),
    '0x',
  ];
  const policyManagerConfig = await encodeArgs(
    ['address[]', 'bytes[]'],
    [Object.values(policies), policiesSettingsData],
  );
  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
    policyManagerConfig,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      newFundTx,
      vaultProxy,
    },
    policies,
    policiesSettingsData,
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

    const getRegisteredPoliciesCall = policyManager.getRegisteredPolicies();
    await expect(getRegisteredPoliciesCall).resolves.toMatchObject([
      adapterBlacklist.address,
      adapterWhitelist.address,
      assetBlacklist.address,
      assetWhitelist.address,
      maxConcentration.address,
      investorWhitelist.address,
      ...Object.values(policies).map((policy) => policy.address),
    ]);

    const getOwnerCall = policyManager.getOwner();
    await expect(getOwnerCall).resolves.toBe(await fundDeployer.getOwner());
  });

  it.todo('check registered policyHooks per policy');
});

describe('setConfigForFund', () => {
  it.todo('does not allow unequal policies and settingsData array lengths');

  it.todo('does not allow duplicate policies');

  it.todo('does not allow unregistered policies');

  it('successfully configures PolicyManager state and fires events', async () => {
    const {
      deployment: { policyManager },
      fund: { comptrollerProxy, newFundTx },
      policies,
      policiesSettingsData,
    } = await provider.snapshot(snapshot);

    const orderedPolicies = Object.values(policies);

    // Assert state for fund
    const getEnabledPoliciesForFundCall = policyManager.getEnabledPoliciesForFund(
      comptrollerProxy,
    );
    await expect(getEnabledPoliciesForFundCall).resolves.toMatchObject(
      orderedPolicies.map((policy) => policy.address),
    );

    // Assert addFundSettings was called on each policy with its settingsData,
    // only if settingsData was passed
    for (const key in orderedPolicies) {
      if (policiesSettingsData[key] === '0x') {
        expect(
          orderedPolicies[key].addFundSettings.ref,
        ).not.toHaveBeenCalledOnContract();
      } else {
        await expect(
          orderedPolicies[key].addFundSettings.ref,
        ).toHaveBeenCalledOnContractWith(
          comptrollerProxy,
          policiesSettingsData[key],
        );
      }
    }

    // Assert PolicyEnabledForFund events
    const policyEnabledForFundEvent = policyManager.abi.getEvent(
      'PolicyEnabledForFund',
    );
    const events = extractEvent(await newFundTx, policyEnabledForFundEvent);
    expect(events.length).toBe(orderedPolicies.length);
    for (let i = 0; i < orderedPolicies.length; i++) {
      expect(events[i].args).toMatchObject({
        comptrollerProxy: comptrollerProxy.address,
        policy: orderedPolicies[i].address,
        settingsData: utils.hexlify(policiesSettingsData[i]),
      });
    }
  });
});

describe('activateForFund', () => {
  it.todo('calls each enabled policy to activate (migrated fund only)');
});

describe('state getters', () => {
  it.todo('determine tests');
});

describe('deregisterPolicies', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _policies param');

  it.todo('does not allow an unregistered policy');

  it.todo(
    'successfully de-registers multiple policies and fires one event per policy',
  );
});

describe('registerPolicies', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _policies param');

  it.todo('does not allow an already registered policy');

  it('correctly handles a valid call (multiple implemented hooks)', async () => {
    const {
      config: { deployer },
      deployment: { policyManager },
    } = await provider.snapshot(snapshot);

    // Setup a mock policy that implements multiple hooks
    const identifier = `MOCK_POLICY`;
    const hooks = [policyHooks.PreBuyShares, policyHooks.PreCallOnIntegration];
    const notIncludedHooks = [
      policyHooks.PostBuyShares,
      policyHooks.PostCallOnIntegration,
    ];
    const mockPolicy = await IPolicy.mock(deployer);
    await mockPolicy.identifier.returns(identifier);
    await mockPolicy.implementedHooks.returns(hooks);

    // Register the policies
    const registerPoliciesTx = policyManager.registerPolicies([mockPolicy]);
    await expect(registerPoliciesTx).resolves.toBeReceipt();

    // Policies should be registered
    const getRegisteredPoliciesCall = policyManager.getRegisteredPolicies();
    await expect(getRegisteredPoliciesCall).resolves.toEqual(
      expect.arrayContaining([mockPolicy.address]),
    );

    // Policy hooks should be stored
    for (const hook of hooks) {
      const goodPolicyImplementsHookCall = policyManager.policyImplementsHook(
        mockPolicy,
        hook,
      );
      await expect(goodPolicyImplementsHookCall).resolves.toBe(true);
    }
    for (const hook of notIncludedHooks) {
      const badPolicyImplementsHookCall = policyManager.policyImplementsHook(
        mockPolicy,
        hook,
      );
      await expect(badPolicyImplementsHookCall).resolves.toBe(false);
    }

    // Assert event
    const events = extractEvent(await registerPoliciesTx, 'PolicyRegistered');
    expect(events.length).toBe(1);
    expect(events[0].args).toMatchObject({
      0: mockPolicy.address,
      1: expect.objectContaining({
        hash: utils.id(identifier),
      }),
      2: hooks,
    });
  });
});

describe('disablePolicyForFund', () => {
  it.todo('does not allow a random user');

  it.todo('does not allow disabled policy');

  it.todo('does not allow non-BuyShares policy');

  it.todo('handles a valid call');
});

describe('enablePolicyForFund', () => {
  it.todo('does not allow a random user');

  it.todo('does not allow non-BuyShares policy');

  it.todo('handles a valid call');
});

describe('validatePolicies', () => {
  it('correctly handles a BuyShares PolicyHook', async () => {
    const {
      accounts: { 0: buyer },
      fund: { comptrollerProxy, denominationAsset, vaultProxy },
      policies: {
        mockPreBuySharesPolicy,
        mockPostBuySharesPolicy,
        mockPreCoIPolicy,
        mockPostCoIPolicy,
      },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert validateRule called on correct policies
    const preRuleArgs = await validateRulePreBuySharesArgs({
      buyer,
      investmentAmount,
      minSharesQuantity: investmentAmount,
      gav: 0, // No investments have been made yet, so gav is 0
    });

    await expect(
      mockPreBuySharesPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      policyHooks.PreBuyShares,
      preRuleArgs,
    );
    await expect(
      mockPostBuySharesPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      policyHooks.PostBuyShares,
      validateRulePostBuySharesArgs(buyer, investmentAmount, investmentAmount),
    );

    // Assert validateRule not called on other policies
    expect(mockPreCoIPolicy.validateRule.ref).not.toHaveBeenCalledOnContract();
    expect(mockPostCoIPolicy.validateRule.ref).not.toHaveBeenCalledOnContract();
  });

  it('correctly handles a CallOnIntegration PolicyHook', async () => {
    const {
      deployment: {
        integrationManager,
        mockGenericAdapter,
        tokens: { dai, mln, weth },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      policies: {
        mockPreBuySharesPolicy,
        mockPostBuySharesPolicy,
        mockPreCoIPolicy,
        mockPostCoIPolicy,
      },
    } = await provider.snapshot(snapshot);

    // Define complex spend and incoming asset values to ensure correct data passed to PolicyManager
    const spendAssets = [weth, dai];
    const spendAssetAmounts = [utils.parseEther('1'), utils.parseEther('1')];
    const incomingAssets = [dai, mln];
    const minIncomingAssetAmounts = [1234, 5678];

    // Since `mockGenericSwap` seeds funds by sending directly to a vault,
    // the incoming assets are not yet tracked, meaning the final token balance
    // will be the reported incoming asset amount
    // (rather than the diff in token balances from start to finish)
    const actualIncomingAssetAmounts = [
      utils.parseEther('10'),
      utils.parseEther('2'),
    ];

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
    await expect(
      mockPreCoIPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      policyHooks.PreCallOnIntegration,
      validateRulePreCoIArgs(mockGenericAdapter, mockGenericSwapASelector),
    );

    // Outgoing assets are the spend assets that are not also incoming assets
    const outgoingAssets = [weth];
    const outgoingAssetAmounts = [utils.parseEther('1')];

    await expect(
      mockPostCoIPolicy.validateRule.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      policyHooks.PostCallOnIntegration,
      validateRulePostCoIArgs(
        mockGenericAdapter,
        mockGenericSwapASelector,
        incomingAssets,
        actualIncomingAssetAmounts,
        outgoingAssets,
        outgoingAssetAmounts,
      ),
    );

    // Assert validateRule not called on other policies
    expect(
      mockPreBuySharesPolicy.validateRule.ref,
    ).not.toHaveBeenCalledOnContract();
    expect(
      mockPostBuySharesPolicy.validateRule.ref,
    ).not.toHaveBeenCalledOnContract();
  });

  it('reverts if return value is false', async () => {
    const {
      deployment: { integrationManager, mockGenericAdapter },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      policies: { mockPreCoIPolicy },
    } = await provider.snapshot(snapshot);

    // Set policy to return validateRule as false
    await mockPreCoIPolicy.validateRule.returns(false);

    const swapTx = mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
    });
    await expect(swapTx).rejects.toBeRevertedWith('Rule evaluated to false');
  });
});
