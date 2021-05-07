import { ChainlinkRateAsset } from '@enzymefinance/protocol';
import { constants } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
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
  curve: {
    addressProvider: string;
    minter: string;
    pools: Record<string, { pool: string; lpToken: string; liquidityGaugeToken: string; invariantProxyAsset: string }>;
  };
  aave: {
    lendingPoolAddressProvider: string;
    protocolDataProvider: string;
    atokens: Record<string, readonly [string, string]>;
  };
  alphaHomoraV1: {
    ibeth: string;
  };
  compound: {
    ceth: string;
    ctokens: Record<string, string>;
  };
  idle: Record<string, string>;
  kyber: {
    networkProxy: string;
  };
  lido: {
    steth: string;
  };
  paraSwapV4: {
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
  vaultCalls: [address: string, sighash: string][];
}

const fn: DeployFunction = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
