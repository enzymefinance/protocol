import { IPolicy, PolicyHook, PolicyManager, policyManagerConfigArgs } from '@enzymefinance/protocol';
import { constants, Signer, utils } from 'ethers';

// Policy Manager

export async function generatePolicyManagerConfigWithMockPolicies({
  deployer,
  policyManager,
}: {
  deployer: Signer;
  policyManager: PolicyManager;
}) {
  const policies = await generateRegisteredMockPolicies({
    deployer,
    policyManager,
  });

  const policiesSettingsData = [utils.randomBytes(10), constants.HashZero, constants.HashZero, utils.randomBytes(2)];

  return policyManagerConfigArgs({
    policies: Object.values(policies),
    settings: policiesSettingsData,
  });
}

export async function generateRegisteredMockPolicies({
  deployer,
  policyManager,
}: {
  deployer: Signer;
  policyManager: PolicyManager;
}) {
  // Create mock policies
  const mockPreBuySharesPolicy = await IPolicy.mock(deployer);
  const mockPostBuySharesPolicy = await IPolicy.mock(deployer);
  const mockPreCoIPolicy = await IPolicy.mock(deployer);
  const mockPostCoIPolicy = await IPolicy.mock(deployer);

  // Initialize mock policy return values
  await Promise.all([
    // PreBuyShares
    mockPreBuySharesPolicy.identifier.returns(`MOCK_PRE_BUY_SHARES`),
    mockPreBuySharesPolicy.addFundSettings.returns(undefined),
    mockPreBuySharesPolicy.activateForFund.returns(undefined),
    mockPreBuySharesPolicy.validateRule.returns(true),
    mockPreBuySharesPolicy.implementedHooks.returns([PolicyHook.PreBuyShares]),
    mockPreBuySharesPolicy.updateFundSettings.returns(undefined),
    // PostBuyShares
    mockPostBuySharesPolicy.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesPolicy.addFundSettings.returns(undefined),
    mockPostBuySharesPolicy.activateForFund.returns(undefined),
    mockPostBuySharesPolicy.validateRule.returns(true),
    mockPostBuySharesPolicy.implementedHooks.returns([PolicyHook.PostBuyShares]),
    mockPostBuySharesPolicy.updateFundSettings.returns(undefined),
    // PreCallOnIntegration
    mockPreCoIPolicy.identifier.returns(`MOCK_PRE_CALL_ON_INTEGRATION`),
    mockPreCoIPolicy.addFundSettings.returns(undefined),
    mockPreCoIPolicy.activateForFund.returns(undefined),
    mockPreCoIPolicy.validateRule.returns(true),
    mockPreCoIPolicy.implementedHooks.returns([PolicyHook.PreCallOnIntegration]),
    mockPreCoIPolicy.updateFundSettings.returns(undefined),
    // PostCallOnIntegration
    mockPostCoIPolicy.identifier.returns(`MOCK_POST_CALL_ON_INTEGRATION`),
    mockPostCoIPolicy.addFundSettings.returns(undefined),
    mockPostCoIPolicy.activateForFund.returns(undefined),
    mockPostCoIPolicy.validateRule.returns(true),
    mockPostCoIPolicy.implementedHooks.returns([PolicyHook.PostCallOnIntegration]),
    mockPostCoIPolicy.updateFundSettings.returns(undefined),
  ]);

  // Register all mock policies
  await policyManager.registerPolicies([
    mockPreBuySharesPolicy,
    mockPostBuySharesPolicy,
    mockPreCoIPolicy,
    mockPostCoIPolicy,
  ]);

  return {
    mockPreBuySharesPolicy,
    mockPostBuySharesPolicy,
    mockPreCoIPolicy,
    mockPostCoIPolicy,
  };
}
