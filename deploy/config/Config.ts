import { constants } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ChainlinkRateAsset } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

export async function saveConfig(hre: HardhatRuntimeEnvironment, data: DeploymentConfig) {
  await hre.deployments.save('Config', {
    abi: [],
    address: constants.AddressZero,
    linkedData: data,
  });
}

export async function loadConfig(hre: HardhatRuntimeEnvironment) {
  const deployment = await hre.deployments.get('Config');
  return deployment.linkedData as DeploymentConfig;
}

export async function hasConfig(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return !!(await hre.deployments.getOrNull('Config'));
}

export interface DeploymentConfig {
  weth: string;
  primitives: Record<string, string>;
  chainlink: {
    ethusd: string;
    aggregators: Record<string, readonly [string, ChainlinkRateAsset]>;
  };
  wdgld: {
    wdgld: string;
    ethusd: string;
    xauusd: string;
  };
  synthetix: {
    snx: string;
    susd: string;
    synths: Record<string, string>;
    addressResolver: string;
    delegateApprovals: string;
    originator: string;
    trackingCode: string;
  };
  compound: {
    ceth: string;
    ctokens: Record<string, string>;
  };
  chai: {
    dai: string;
    chai: string;
    pot: string;
  };
  kyber: {
    networkProxy: string;
  };
  paraswap: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  stakehound: {
    steth: string;
  };
  uniswap: {
    factory: string;
    router: string;
    pools: Record<string, string>;
  };
  zeroex: {
    exchange: string;
    allowedMakers: string[];
  };
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: number;
    };
  };
}

const fn: DeployFunction = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
