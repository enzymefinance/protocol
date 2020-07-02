import { ethers } from 'ethers';
import { FundFactory, AssetBlacklist, AssetWhitelist, WETH } from '~/framework/contracts';
import { Contract, getArtifactAddress, getArtifact } from '~/framework/Contract';

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
  address: string;
  rate: ethers.BigNumberish;
  period: ethers.BigNumberish;
}

export interface PolicyParams {
  address: string;
  encoding: (string | ethers.utils.ParamType)[];
  settings: any[];
}

export interface SetupFundParams {
  name?: string;
  adapters?: string[];
  fees?: FeeParams[];
  policies?: PolicyParams[];
  denominator?: string;
}

export async function setupFundWithParams({
  name = `test-fund-${Date.now()}`,
  fees = [],
  policies = [],
  adapters = [],
  denominator = Contract.artifactAddress(WETH),
}: SetupFundParams) {
  const fundFactory = Contract.fromArtifact(FundFactory);
  const fundName = stringToBytes(name);
  const feesAddresses = fees.map(item => item.address);
  const feesRates = fees.map(item => item.rate);
  const feesPeriods = fees.map(item => item.period);
  const policiesAddresses = policies.map(item => item.address);
  const policiesSettings = policies.map(item => encodeArgs(item.encoding, item.settings));

  const result = await fundFactory.beginFundSetup(
    fundName,
    feesAddresses,
    feesRates,
    feesPeriods,
    policiesAddresses,
    policiesSettings as any,
    adapters,
    denominator,
  );
};

describe('general walkthrough', () => {
  it('set up a fund', async () => {
    await setupFundWithParams({
      policies: [
        {
          address: Contract.artifactAddress(AssetBlacklist),
          settings: [[Contract.artifactAddress(WETH)]],
          encoding: ['address[]'],
        }
      ]
    });
  });
});
