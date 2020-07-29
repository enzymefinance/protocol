import { ethers } from 'ethers';
import { FeeParams } from './fees';
import { PolicyParams } from './policies';
import { stringToBytes, encodeArgs } from '../common';
import * as contracts from '../../contracts';

export interface SetupFundParams {
  factory: contracts.FundFactory;
  denominationAsset: string;
  manager?: ethers.Signer;
  name?: string;
  adapters?: string[];
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
  const denominationAssetAddress = ethers.utils.getAddress(denominationAsset);
  const fundName = stringToBytes(name);
  const feesRates = fees.map((item) => item.rate);
  const feesPeriods = fees.map((item) => item.period);

  const policiesSettings = policies.map((item) =>
    encodeArgs(item.encoding, item.settings),
  );

  const feesAddresses = fees.map((item) =>
    ethers.utils.getAddress(item.address),
  );

  const policiesAddresses = policies.map((item) =>
    ethers.utils.getAddress(item.address),
  );

  const adapterAddresses = adapters.map((item) =>
    ethers.utils.getAddress(item),
  );

  await factory.beginFundSetup(
    fundName,
    feesAddresses,
    feesRates as any,
    feesPeriods as any,
    policiesAddresses,
    policiesSettings as any,
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
  feeManager: contracts.FeeManager;
  policyManager: contracts.PolicyManager;
  shares: contracts.Shares;
  vault: contracts.Vault;
}

export async function getFundComponents(
  address: string,
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
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
