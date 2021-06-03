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
  const policies = Object.values(
    await generateRegisteredMockPolicies({
      deployer,
      policyManager,
    }),
  );

  // Guarantees one policy has settings data
  const policiesSettingsData = [...new Array(policies.length - 1).fill(constants.HashZero), utils.randomBytes(10)];

  return policyManagerConfigArgs({
    policies,
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
  const mockAddTrackedAssetsPolicy = await IPolicy.mock(deployer);
  const mockPostBuySharesPolicy = await IPolicy.mock(deployer);
  const mockPostCoIPolicy = await IPolicy.mock(deployer);
  const mockRedeemSharesForSpecificAssetsPolicy = await IPolicy.mock(deployer);

  // Initialize mock policy return values
  await Promise.all([
    // AddTrackedAssets
    mockAddTrackedAssetsPolicy.identifier.returns(`MOCK_ADD_TRACKED_ASSETS`),
    mockAddTrackedAssetsPolicy.addFundSettings.returns(undefined),
    mockAddTrackedAssetsPolicy.activateForFund.returns(undefined),
    mockAddTrackedAssetsPolicy.canDisable.returns(false),
    mockAddTrackedAssetsPolicy.validateRule.returns(true),
    mockAddTrackedAssetsPolicy.implementedHooks.returns([PolicyHook.AddTrackedAssets]),
    mockAddTrackedAssetsPolicy.updateFundSettings.returns(undefined),
    // PostBuyShares
    mockPostBuySharesPolicy.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesPolicy.addFundSettings.returns(undefined),
    mockPostBuySharesPolicy.activateForFund.returns(undefined),
    mockPostBuySharesPolicy.canDisable.returns(false),
    mockPostBuySharesPolicy.validateRule.returns(true),
    mockPostBuySharesPolicy.implementedHooks.returns([PolicyHook.PostBuyShares]),
    mockPostBuySharesPolicy.updateFundSettings.returns(undefined),
    // PostCallOnIntegration
    mockPostCoIPolicy.identifier.returns(`MOCK_POST_CALL_ON_INTEGRATION`),
    mockPostCoIPolicy.addFundSettings.returns(undefined),
    mockPostCoIPolicy.activateForFund.returns(undefined),
    mockPostCoIPolicy.canDisable.returns(false),
    mockPostCoIPolicy.validateRule.returns(true),
    mockPostCoIPolicy.implementedHooks.returns([PolicyHook.PostCallOnIntegration]),
    mockPostCoIPolicy.updateFundSettings.returns(undefined),
    // RedeemSharesForSpecificAssets
    mockRedeemSharesForSpecificAssetsPolicy.identifier.returns(`MOCK_REDEEM_SHARES_FOR_SPECIFIC_ASSETS`),
    mockRedeemSharesForSpecificAssetsPolicy.addFundSettings.returns(undefined),
    mockRedeemSharesForSpecificAssetsPolicy.activateForFund.returns(undefined),
    mockRedeemSharesForSpecificAssetsPolicy.canDisable.returns(false),
    mockRedeemSharesForSpecificAssetsPolicy.validateRule.returns(true),
    mockRedeemSharesForSpecificAssetsPolicy.implementedHooks.returns([PolicyHook.RedeemSharesForSpecificAssets]),
    mockRedeemSharesForSpecificAssetsPolicy.updateFundSettings.returns(undefined),
  ]);

  // Register all mock policies
  await policyManager.registerPolicies([
    mockAddTrackedAssetsPolicy,
    mockPostBuySharesPolicy,
    mockPostCoIPolicy,
    mockRedeemSharesForSpecificAssetsPolicy,
  ]);

  return {
    mockAddTrackedAssetsPolicy,
    mockPostBuySharesPolicy,
    mockPostCoIPolicy,
    mockRedeemSharesForSpecificAssetsPolicy,
  };
}
