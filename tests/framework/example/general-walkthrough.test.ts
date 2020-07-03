import { ethers } from 'ethers';
import { Contract, resolveAddress, AddressLike } from '~/framework/Contract';
import * as contracts from '~/framework/contracts';
import * as fixtures from '~/framework/fixtures';

export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, numBytes);
}

export function encodeArgs(types: (string | ethers.utils.ParamType)[], args: any[]) {
  const hex = ethers.utils.defaultAbiCoder.encode(types, args);
  return ethers.utils.arrayify(hex);
}

export interface FeeParams {
  address: AddressLike;
  rate: ethers.BigNumberish;
  period: ethers.BigNumberish;
}

export interface PolicyParams {
  address: AddressLike;
  encoding: (string | ethers.utils.ParamType)[];
  settings: any[];
}

export interface SetupFundParams {
  manager?: ethers.Signer,
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

  const feesRates = resolvedFees.map(item => item.rate);
  const feesPeriods = resolvedFees.map(item => item.period);
  const policiesSettings = resolvedPolicies.map(item => encodeArgs(item.encoding, item.settings));

  const feesAddresses = await Promise.all(resolvedFees.map(item => resolveAddress(item.address)));
  const policiesAddresses = await Promise.all(resolvedPolicies.map(item => resolveAddress(item.address)));
  const adapterAddresses = await Promise.all(adapters.map(item => resolveAddress(item)));
  const denominatorAddress = await resolveAddress(denominator);

  await fundFactory.beginFundSetup(
    fundName,
    feesAddresses,
    feesRates,
    feesPeriods,
    policiesAddresses,
    policiesSettings as any,
    adapterAddresses,
    denominatorAddress,
  ).send();

  await (await fundFactory.createFeeManager().send()).wait();
  await (await fundFactory.createPolicyManager().send()).wait();
  await (await fundFactory.createShares().send()).wait();
  await (await fundFactory.createVault().send()).wait();

  const result = (await (await fundFactory.completeFundSetup().send()).wait());
  const event = result.events?.find(item => item.event === 'FundSetupCompleted');

  if (!event) {
    throw new Error(`Missing 'FundSetupCompleted' event in transaction receipt`);
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

  const feeManager = new contracts.FeeManager(feeManagerAddress, signerOrProvider);
  const policyManager = new contracts.PolicyManager(policyManagerAddress, signerOrProvider);
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

async function assetBlacklistPolicy(
  blacklist: AddressLike[],
  address: AddressLike = fixtures.AssetBlacklist,
): Promise<PolicyParams> {
  return {
    address: await resolveAddress(address),
    encoding: ['address[]'],
    settings: [await Promise.all(blacklist.map(item => resolveAddress(item)))],
  };
}

async function assetWhitelistPolicy(
  whitelist: AddressLike[],
  address: AddressLike = fixtures.AssetWhitelist,
): Promise<PolicyParams> {
  return {
    address: await resolveAddress(address),
    encoding: ['address[]'],
    settings: [await Promise.all(whitelist.map(item => resolveAddress(item)))],
  };
}

async function managementFee(
  rate: number = 0.1,
  period: number = 30,
  address: AddressLike = fixtures.ManagementFee,
): Promise<FeeParams> {
  return {
    address: await resolveAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}

async function performanceFee(
  rate: number = 0.1,
  period: number = 30,
  address: AddressLike = fixtures.PerformanceFee,
): Promise<FeeParams> {
  return {
    address: await resolveAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}

describe('general walkthrough', () => {
  it('set up a fund', async () => {
    const fund = await setupFundWithParams({
      policies: [
        assetWhitelistPolicy([fixtures.WETH, fixtures.MLN])
      ],
      fees: [
        managementFee(0.1, 30),
        performanceFee(0.1, 90),
      ],
      adapters: [
        fixtures.KyberAdapter,
        fixtures.EngineAdapter,
      ],
    });

    expect(await fixtures.Registry.fundIsRegistered(fund.hub)).toBeTruthy();
  });
});
