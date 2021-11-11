import type { ChainlinkRateAsset } from '@enzymefinance/protocol';
import { constants } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

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
  gsn: {
    relayHub: string;
    relayWorker: string;
    trustedForwarder: string;
  };
  chainlink: {
    ethusd: string;
    aggregators: Record<string, readonly [string, ChainlinkRateAsset]>;
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
    atokens: Record<string, [string, string]>;
  };
  compound: {
    ceth: string;
    comptroller: string;
    ctokens: Record<string, string>;
  };
  idle: {
    bestYieldIdleDai: string;
    bestYieldIdleUsdc: string;
    bestYieldIdleUsdt: string;
    bestYieldIdleSusd: string;
    bestYieldIdleTusd: string;
    bestYieldIdleWbtc: string;
    riskAdjustedIdleDai: string;
    riskAdjustedIdleUsdc: string;
    riskAdjustedIdleUsdt: string;
  };
  lido: {
    steth: string;
  };
  paraSwapV4: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  paraSwapV5: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  poolTogetherV4: {
    ptTokens: Record<string, [string, string]>;
  };
  stakehound: {
    steth: string;
  };
  unsupportedAssets: Record<string, string>;
  uniswap: {
    factory: string;
    router: string;
    pools: Record<string, string>;
  };
  uniswapV3: {
    router: string;
    nonFungiblePositionManager: string;
  };
  yearn: {
    vaultV2: {
      registry: string;
      yVaults: Record<string, string>;
    };
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
  vaultCalls: [contract: string, sighash: string, dataHash: string][];
}

const fn: DeployFunction = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
