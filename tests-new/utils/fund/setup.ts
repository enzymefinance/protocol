import { ethers } from 'ethers';
import { AddressLike, resolveAddress } from '@crestproject/crestproject';
import { FeeParams } from './fees';
import { PolicyParams } from './policies';
import { stringToBytes, encodeArgs } from '../common';
import * as contracts from '../../contracts';

export interface SetupFundParams {
  factory: contracts.FundFactory;
  denominationAsset: AddressLike;
  manager?: ethers.Signer;
  name?: string;
  adapters?: AddressLike[];
  fees?: FeeParams[];
  policies?: PolicyParams[];
}

export async function setupFundWithParams({
  factory,
  denominationAsset,
  name = `test-fund-${Date.now()}`,
  fees = [],
  policies = [],
  adapters = [],
}: SetupFundParams) {
  const fundName = stringToBytes(name);
  const feesRates = fees.map((item) => item.rate);
  const feesPeriods = fees.map((item) => item.period);
  const policiesSettings = policies.map((item) => {
    return encodeArgs(item.encoding, item.settings);
  });

  const [
    denominationAssetAddress,
    adapterAddresses,
    policiesAddresses,
    feesAddresses,
  ] = await Promise.all([
    resolveAddress(denominationAsset),
    Promise.all(adapters.map((address) => resolveAddress(address))),
    Promise.all(policies.map((item) => resolveAddress(item.address))),
    Promise.all(fees.map((item) => resolveAddress(item.address))),
  ]);

  await factory.beginFundSetup(
    fundName,
    feesAddresses,
    feesRates,
    feesPeriods,
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
  providider: ethers.Signer | ethers.providers.Provider,
): Promise<FundComponents> {
  const hub = new contracts.Hub(address, providider);
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

  const vault = new contracts.Vault(vaultAddress, providider);
  const shares = new contracts.Shares(sharesAddress, providider);
  const feeManager = new contracts.FeeManager(feeManagerAddress, providider);
  const policyManager = new contracts.PolicyManager(
    policyManagerAddress,
    providider,
  );

  return {
    hub,
    vault,
    shares,
    feeManager,
    policyManager,
  };
}
