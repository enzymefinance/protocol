import { Signer, providers } from 'ethers';
import { AddressLike, resolveAddress } from '@crestproject/crestproject';
import { FeeParams } from './fees';
import { PolicyParams } from './policies';
import { stringToBytes, encodeArgs } from '../common';
import {
  DenominationAssetInterface,
  requestShares,
  RequestSharesParams,
} from './investing';
import * as contracts from '../../contracts';

export type InitialInvestmentParams = Omit<
  RequestSharesParams,
  'fundComponents' | 'denominationAsset'
>;

export interface SetupFundParams {
  factory: contracts.FundFactory;
  denominationAsset: DenominationAssetInterface;
  manager?: Signer;
  name?: string;
  adapters?: AddressLike[];
  fees?: FeeParams[];
  policies?: PolicyParams[];
  investment?: InitialInvestmentParams;
}

export async function setupFundWithParams({
  factory,
  denominationAsset,
  name = `test-fund-${Date.now()}`,
  fees = [],
  policies = [],
  adapters = [],
  investment,
}: SetupFundParams) {
  const fundName = stringToBytes(name);

  const [
    denominationAssetAddress,
    adapterAddresses,
    feesAddresses,
    feesSettings,
    policiesAddresses,
    policiesSettings,
  ] = await Promise.all([
    resolveAddress(denominationAsset),
    Promise.all(adapters.map((address) => resolveAddress(address))),
    Promise.all(fees.map((item) => resolveAddress(item.address))),
    Promise.all(
      fees.map((item) => encodeArgs(item.encoding, item.settings)),
    ),
    Promise.all(policies.map((item) => resolveAddress(item.address))),
    Promise.all(
      policies.map((item) => encodeArgs(item.encoding, item.settings)),
    ),
  ]);

  await factory.beginFundSetup(
    fundName,
    feesAddresses,
    feesSettings,
    policiesAddresses,
    policiesSettings,
    adapterAddresses,
    denominationAssetAddress,
  );

  await factory.createFeeManager();
  await factory.createPolicyManager();
  await factory.createShares();
  await factory.createVault();

  const result = await factory.completeFundSetup();
  const fragment = factory.abi.getEvent('FundSetupCompleted');
  const eventLog = result.logs?.find(
    (item) => item.topics[0] == factory.abi.getEventTopic(fragment),
  );

  if (!eventLog) {
    throw new Error(
      `Missing 'FundSetupCompleted' event in transaction receipt`,
    );
  }

  const event = factory.abi.parseLog(eventLog);
  const components = await getFundComponents(event.args!.hub, factory.signer!);

  if (investment != null) {
    await requestShares({
      denominationAsset: denominationAsset,
      fundComponents: components,
      ...investment,
    });
  }

  return components;
}

export interface FundComponents {
  hub: contracts.Hub;
  vault: contracts.Vault;
  shares: contracts.Shares;
  feeManager: contracts.FeeManager;
  policyManager: contracts.PolicyManager;
}

export async function getFundComponents(
  address: string,
  provider: Signer | providers.Provider,
): Promise<FundComponents> {
  const hub = new contracts.Hub(address, provider);
  const [
    vaultAddress,
    sharesAddress,
    feeManagerAddress,
    policyManagerAddress,
  ] = await Promise.all([
    hub.vault(),
    hub.shares(),
    hub.feeManager(),
    hub.policyManager(),
  ]);

  const vault = new contracts.Vault(vaultAddress, provider);
  const shares = new contracts.Shares(sharesAddress, provider);
  const feeManager = new contracts.FeeManager(feeManagerAddress, provider);
  const policyManager = new contracts.PolicyManager(
    policyManagerAddress,
    provider,
  );

  return {
    hub,
    vault,
    shares,
    feeManager,
    policyManager,
  };
}
