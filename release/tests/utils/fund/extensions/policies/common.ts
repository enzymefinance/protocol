import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, BytesLike, Signer, utils } from 'ethers';
import { IPolicy } from '../../../../../codegen/IPolicy';
import { PolicyManager } from '../../../../../utils/contracts';
import { encodeArgs } from '../../../common';

// Policy Manager

export enum policyHooks {
  None,
  BuyShares,
  CallOnIntegration,
}

export enum policyHookExecutionTimes {
  None,
  Pre,
  Post,
}

export async function generatePolicyManagerConfigWithMockFees({
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

  const policiesSettingsData = [
    utils.randomBytes(10),
    '0x',
    '0x',
    utils.randomBytes(2),
  ];

  return encodeArgs(
    ['address[]', 'bytes[]'],
    [Object.values(policies), policiesSettingsData],
  );
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
    mockPreBuySharesPolicy.identifier.returns(`MOCK_PRE_BUY_SHARES`),
    mockPreBuySharesPolicy.addFundSettings.returns(undefined),
    mockPreBuySharesPolicy.activateForFund.returns(undefined),
    mockPreBuySharesPolicy.validateRule.returns(true),
    mockPreBuySharesPolicy.policyHook.returns(policyHooks.BuyShares),
    mockPreBuySharesPolicy.policyHookExecutionTime.returns(
      policyHookExecutionTimes.Pre,
    ),
    mockPostBuySharesPolicy.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesPolicy.addFundSettings.returns(undefined),
    mockPostBuySharesPolicy.activateForFund.returns(undefined),
    mockPostBuySharesPolicy.validateRule.returns(true),
    mockPostBuySharesPolicy.policyHook.returns(policyHooks.BuyShares),
    mockPostBuySharesPolicy.policyHookExecutionTime.returns(
      policyHookExecutionTimes.Post,
    ),
    mockPreCoIPolicy.identifier.returns(`MOCK_PRE_CALL_ON_INTEGRATION`),
    mockPreCoIPolicy.addFundSettings.returns(undefined),
    mockPreCoIPolicy.activateForFund.returns(undefined),
    mockPreCoIPolicy.validateRule.returns(true),
    mockPreCoIPolicy.policyHook.returns(policyHooks.CallOnIntegration),
    mockPreCoIPolicy.policyHookExecutionTime.returns(
      policyHookExecutionTimes.Pre,
    ),
    mockPostCoIPolicy.identifier.returns(`MOCK_POST_CALL_ON_INTEGRATION`),
    mockPostCoIPolicy.addFundSettings.returns(undefined),
    mockPostCoIPolicy.activateForFund.returns(undefined),
    mockPostCoIPolicy.validateRule.returns(true),
    mockPostCoIPolicy.policyHook.returns(policyHooks.CallOnIntegration),
    mockPostCoIPolicy.policyHookExecutionTime.returns(
      policyHookExecutionTimes.Post,
    ),
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

export async function policyManagerConfigArgs(
  policies: AddressLike[],
  settingsData: BytesLike[],
) {
  return encodeArgs(['address[]', 'bytes[]'], [policies, settingsData]);
}

export function validateRulePreBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  minSharesQuantity: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, minSharesQuantity],
  );
}

export function validateRulePostBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  sharesBought: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, sharesBought],
  );
}

export function validateRulePreCoIArgs(
  selector: BytesLike,
  adapter: AddressLike,
  incomingAssets: AddressLike[],
  minIncomingAssetAmounts: BigNumberish[],
  spendAssets: AddressLike[],
  spendAssetAmounts: BigNumberish[],
) {
  return encodeArgs(
    ['bytes4', 'address', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [
      selector,
      adapter,
      incomingAssets,
      minIncomingAssetAmounts,
      spendAssets,
      spendAssetAmounts,
    ],
  );
}

export function validateRulePostCoIArgs(
  selector: BytesLike,
  adapter: AddressLike,
  incomingAssets: AddressLike[],
  incomingAssetAmounts: BigNumberish[],
  outgoingAssets: AddressLike[],
  outgoingAssetAmounts: BigNumberish[],
) {
  return encodeArgs(
    ['bytes4', 'address', 'address[]', 'uint256[]', 'address[]', 'uint256[]'],
    [
      selector,
      adapter,
      incomingAssets,
      incomingAssetAmounts,
      outgoingAssets,
      outgoingAssetAmounts,
    ],
  );
}

// Policies

export async function adapterBlacklistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export async function adapterWhitelistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export async function assetBlacklistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export async function assetWhitelistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export async function buySharesPriceFeedToleranceArgs(tolerance: BigNumberish) {
  return encodeArgs(['uint256'], [tolerance]);
}

export async function investorWhitelistArgs({
  investorsToAdd = [],
  investorsToRemove = [],
}: {
  investorsToAdd?: AddressLike[];
  investorsToRemove?: AddressLike[];
}) {
  return encodeArgs(
    ['address[]', 'address[]'],
    [investorsToAdd, investorsToRemove],
  );
}

export async function maxConcentrationArgs(maxConcentration: BigNumberish) {
  return encodeArgs(['uint256'], [maxConcentration]);
}
