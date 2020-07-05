import { ethers } from 'ethers';
import { contracts, fixtures } from '~/framework';
import { AddressLike } from '~/framework/types';
import { Contract } from '~/framework/contract';
import { FeeParams, PolicyParams } from '~/framework/fund';
import { stringToBytes, encodeArgs, resolveAddress } from '~/framework/utils';

export interface SetupFundParams {
  manager?: ethers.Signer;
  name?: string;
  adapters?: AddressLike[];
  fees?: (FeeParams | Promise<FeeParams>)[];
  policies?: (PolicyParams | Promise<PolicyParams>)[];
  denominator?: AddressLike;
}

export async function setupFundWithParams({
  manager = ethersSigners[0],
  name = `test-fund-${Date.now()}`,
  fees = [],
  policies = [],
  adapters = [],
  denominator = fixtures.WETH,
}: SetupFundParams) {
  const fundFactory = Contract.fromArtifact(contracts.FundFactory, manager);
  const fundName = stringToBytes(name);

  const resolvedFees = await Promise.all(fees);
  const resolvedPolicies = await Promise.all(policies);

  const feesRates = resolvedFees.map((item) => item.rate);
  const feesPeriods = resolvedFees.map((item) => item.period);

  const policiesSettings = resolvedPolicies.map((item) =>
    encodeArgs(item.encoding, item.settings),
  );

  const feesAddresses = await Promise.all(
    resolvedFees.map((item) => resolveAddress(item.address)),
  );

  const policiesAddresses = await Promise.all(
    resolvedPolicies.map((item) => resolveAddress(item.address)),
  );

  const adapterAddresses = await Promise.all(
    adapters.map((item) => resolveAddress(item)),
  );

  const denominatorAddress = await resolveAddress(denominator);

  await fundFactory
    .beginFundSetup(
      fundName,
      feesAddresses,
      feesRates,
      feesPeriods,
      policiesAddresses,
      policiesSettings as any,
      adapterAddresses,
      denominatorAddress,
    )
    .send();

  await fundFactory.createFeeManager().send();
  await fundFactory.createPolicyManager().send();
  await fundFactory.createShares().send();
  await fundFactory.createVault().send();

  const result = await fundFactory.completeFundSetup().send();
  const event = result.events?.find(
    (item) => item.event === 'FundSetupCompleted',
  );

  if (!event) {
    throw new Error(
      `Missing 'FundSetupCompleted' event in transaction receipt`,
    );
  }

  const components = await getFundComponents(event.args!.hub, manager);
  return components;
}

export interface FundComponents {
  hub: contracts.Hub;
  feeManager: contracts.FeeManager;
  policyManager: contracts.PolicyManager;
  shares: contracts.Shares;
  vault: contracts.Vault;
}

export async function getFundComponents(
  address: string,
  signerOrProvider: ethers.Signer | ethers.providers.Provider = ethersProvider,
): Promise<FundComponents> {
  const hub = new contracts.Hub(address, signerOrProvider);
  const [
    feeManagerAddress,
    policyManagerAddress,
    sharesAddress,
    vaultAddress,
  ] = await Promise.all([
    hub.feeManager(),
    hub.policyManager(),
    hub.shares(),
    hub.vault(),
  ]);

  const feeManager = new contracts.FeeManager(
    feeManagerAddress,
    signerOrProvider,
  );

  const policyManager = new contracts.PolicyManager(
    policyManagerAddress,
    signerOrProvider,
  );

  const shares = new contracts.Shares(sharesAddress, signerOrProvider);
  const vault = new contracts.Vault(vaultAddress, signerOrProvider);

  return {
    hub,
    feeManager,
    policyManager,
    shares,
    vault,
  };
}
