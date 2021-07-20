import { IPolicy, PolicyHook, policyManagerConfigArgs } from '@enzymefinance/protocol';
import { constants, Signer, utils } from 'ethers';

// Policy Manager

export async function generatePolicyManagerConfigWithMockPolicies({ deployer }: { deployer: Signer }) {
  const policies = Object.values(
    await generateMockPolicies({
      deployer,
    }),
  );

  // Guarantees one policy has settings data
  const policiesSettingsData = [...new Array(policies.length - 1).fill(constants.HashZero), utils.randomBytes(10)];

  return policyManagerConfigArgs({
    policies,
    settings: policiesSettingsData,
  });
}

export async function generateMockPolicies({ deployer }: { deployer: Signer }) {
  // Create mock policies
  const mockAddTrackedAssetsPolicy = await IPolicy.mock(deployer);
  const mockCreateExternalPositionPolicy = await IPolicy.mock(deployer);
  const mockPostBuySharesPolicy = await IPolicy.mock(deployer);
  const mockPostCallOnExternalPositionPolicy = await IPolicy.mock(deployer);
  const mockPostCoIPolicy = await IPolicy.mock(deployer);
  const mockRedeemSharesForSpecificAssetsPolicy = await IPolicy.mock(deployer);
  const mockPreTransferSharesPolicy = await IPolicy.mock(deployer);
  const mockRemoveExternalPositionPolicy = await IPolicy.mock(deployer);

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
    // CreateExternalPosition
    mockCreateExternalPositionPolicy.identifier.returns(`MOCK_CREATE_EXTERNAL_POSITION`),
    mockCreateExternalPositionPolicy.addFundSettings.returns(undefined),
    mockCreateExternalPositionPolicy.activateForFund.returns(undefined),
    mockCreateExternalPositionPolicy.canDisable.returns(false),
    mockCreateExternalPositionPolicy.validateRule.returns(true),
    mockCreateExternalPositionPolicy.implementedHooks.returns([PolicyHook.CreateExternalPosition]),
    mockCreateExternalPositionPolicy.updateFundSettings.returns(undefined),
    // PostBuyShares
    mockPostBuySharesPolicy.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesPolicy.addFundSettings.returns(undefined),
    mockPostBuySharesPolicy.activateForFund.returns(undefined),
    mockPostBuySharesPolicy.canDisable.returns(false),
    mockPostBuySharesPolicy.validateRule.returns(true),
    mockPostBuySharesPolicy.implementedHooks.returns([PolicyHook.PostBuyShares]),
    mockPostBuySharesPolicy.updateFundSettings.returns(undefined),
    // PostCallOnExternalPosition
    mockPostCallOnExternalPositionPolicy.identifier.returns(`MOCK_POST_CALL_ON_EXTERNAL_POSITION`),
    mockPostCallOnExternalPositionPolicy.addFundSettings.returns(undefined),
    mockPostCallOnExternalPositionPolicy.activateForFund.returns(undefined),
    mockPostCallOnExternalPositionPolicy.canDisable.returns(false),
    mockPostCallOnExternalPositionPolicy.validateRule.returns(true),
    mockPostCallOnExternalPositionPolicy.implementedHooks.returns([PolicyHook.PostCallOnExternalPosition]),
    mockPostCallOnExternalPositionPolicy.updateFundSettings.returns(undefined),
    // PostCallOnIntegration
    mockPostCoIPolicy.identifier.returns(`MOCK_POST_CALL_ON_INTEGRATION`),
    mockPostCoIPolicy.addFundSettings.returns(undefined),
    mockPostCoIPolicy.activateForFund.returns(undefined),
    mockPostCoIPolicy.canDisable.returns(false),
    mockPostCoIPolicy.validateRule.returns(true),
    mockPostCoIPolicy.implementedHooks.returns([PolicyHook.PostCallOnIntegration]),
    mockPostCoIPolicy.updateFundSettings.returns(undefined),
    // PreTransferSharesPolicy
    mockPreTransferSharesPolicy.identifier.returns(`MOCK_PRE_TRANSFER_SHARES`),
    mockPreTransferSharesPolicy.addFundSettings.returns(undefined),
    mockPreTransferSharesPolicy.activateForFund.returns(undefined),
    mockPreTransferSharesPolicy.canDisable.returns(false),
    mockPreTransferSharesPolicy.validateRule.returns(true),
    mockPreTransferSharesPolicy.implementedHooks.returns([PolicyHook.PreTransferShares]),
    mockPreTransferSharesPolicy.updateFundSettings.returns(undefined),
    // RedeemSharesForSpecificAssets
    mockRedeemSharesForSpecificAssetsPolicy.identifier.returns(`MOCK_REDEEM_SHARES_FOR_SPECIFIC_ASSETS`),
    mockRedeemSharesForSpecificAssetsPolicy.addFundSettings.returns(undefined),
    mockRedeemSharesForSpecificAssetsPolicy.activateForFund.returns(undefined),
    mockRedeemSharesForSpecificAssetsPolicy.canDisable.returns(false),
    mockRedeemSharesForSpecificAssetsPolicy.validateRule.returns(true),
    mockRedeemSharesForSpecificAssetsPolicy.implementedHooks.returns([PolicyHook.RedeemSharesForSpecificAssets]),
    mockRedeemSharesForSpecificAssetsPolicy.updateFundSettings.returns(undefined),
    // RemoveExternalPosition
    mockRemoveExternalPositionPolicy.identifier.returns(`MOCK_REMOVE_EXTERNAL_POSITION`),
    mockRemoveExternalPositionPolicy.addFundSettings.returns(undefined),
    mockRemoveExternalPositionPolicy.activateForFund.returns(undefined),
    mockRemoveExternalPositionPolicy.canDisable.returns(false),
    mockRemoveExternalPositionPolicy.validateRule.returns(true),
    mockRemoveExternalPositionPolicy.implementedHooks.returns([PolicyHook.RedeemSharesForSpecificAssets]),
    mockRemoveExternalPositionPolicy.updateFundSettings.returns(undefined),
  ]);

  return {
    mockAddTrackedAssetsPolicy,
    mockCreateExternalPositionPolicy,
    mockPostBuySharesPolicy,
    mockPostCallOnExternalPositionPolicy,
    mockPostCoIPolicy,
    mockPreTransferSharesPolicy,
    mockRedeemSharesForSpecificAssetsPolicy,
    mockRemoveExternalPositionPolicy,
  };
}
