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

  const policiesSettingsData = [utils.randomBytes(10), constants.HashZero];

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
  const mockPostBuySharesPolicy = await IPolicy.mock(deployer);
  const mockPostCoIPolicy = await IPolicy.mock(deployer);

  // Initialize mock policy return values
  await Promise.all([
    // PostBuyShares
    mockPostBuySharesPolicy.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesPolicy.addFundSettings.returns(undefined),
    mockPostBuySharesPolicy.activateForFund.returns(undefined),
    mockPostBuySharesPolicy.validateRule.returns(true),
    mockPostBuySharesPolicy.implementedHooks.returns([PolicyHook.PostBuyShares]),
    mockPostBuySharesPolicy.updateFundSettings.returns(undefined),
    // PostCallOnIntegration
    mockPostCoIPolicy.identifier.returns(`MOCK_POST_CALL_ON_INTEGRATION`),
    mockPostCoIPolicy.addFundSettings.returns(undefined),
    mockPostCoIPolicy.activateForFund.returns(undefined),
    mockPostCoIPolicy.validateRule.returns(true),
    mockPostCoIPolicy.implementedHooks.returns([PolicyHook.PostCallOnIntegration]),
    mockPostCoIPolicy.updateFundSettings.returns(undefined),
  ]);

  // Register all mock policies
  await policyManager.registerPolicies([mockPostBuySharesPolicy, mockPostCoIPolicy]);

  return {
    mockPostBuySharesPolicy,
    mockPostCoIPolicy,
  };
}
