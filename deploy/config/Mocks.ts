import path from 'path';
import fs from 'fs-extra';
import { utils, constants } from 'ethers';
import { DeployOptions, DeployResult } from 'hardhat-deploy/types';
import {
  MockCTokenIntegrateeArgs,
  MockSynthetixTokenArgs,
  MockTokenArgs,
  MockUniswapV2PriceSourceArgs,
} from '@melonproject/protocol';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeploymentConfig } from './Config';

interface DeployMockOptions extends Omit<DeployOptions, 'from'> {
  name?: string;
  from?: string;
  contract: string;
}

export async function deployMock(
  hre: HardhatRuntimeEnvironment,
  { contract, name, from, ...options }: DeployMockOptions,
): Promise<DeployResult> {
  const mockName = `mocks/${contract}${name ? ` (${name})` : ''}`;
  const existingMock = await hre.deployments.getOrNull(mockName);
  if (!!existingMock) {
    hre.deployments.log(`reusing "${mockName}" at ${existingMock.address}`);
    return Object.assign(existingMock, { newlyDeployed: false });
  }

  const root = hre.config.paths.deployments;
  const network = hre.network.name;
  await fs.ensureDir(path.join(root, network, path.dirname(mockName)));

  return await hre.deployments.deploy(mockName, {
    log: true,
    contract,
    from: from ?? (await hre.getNamedAccounts()).deployer,
    ...options,
  });
}

export function createDeployMockToken(hre: HardhatRuntimeEnvironment) {
  return async function (symbol: string, name: string, decimals: number) {
    return await deployMock(hre, {
      name: symbol,
      contract: 'MockToken',
      args: [name, symbol, decimals] as MockTokenArgs,
    });
  };
}

export function createDeployMockSynthetixToken(hre: HardhatRuntimeEnvironment) {
  return async function (symbol: string, name: string, decimals: number) {
    const currency = utils.formatBytes32String(symbol);

    return await deployMock(hre, {
      name: symbol,
      contract: 'MockSynthetixToken',
      args: [name, symbol, decimals, currency] as MockSynthetixTokenArgs,
    });
  };
}

export function createDeployMockCompoundToken(hre: HardhatRuntimeEnvironment, centralizedRateProvider: string) {
  return async function (symbol: string, name: string, decimals: number, primitive: string, rate: number) {
    const normalizedRate = utils.parseEther(`${rate}`);

    return await deployMock(hre, {
      name: symbol,
      contract: 'MockCTokenIntegratee',
      args: [name, symbol, decimals, primitive, centralizedRateProvider, normalizedRate] as MockCTokenIntegrateeArgs,
    });
  };
}

export function createDeployMockUniswapPair(hre: HardhatRuntimeEnvironment) {
  return async function (name: string, a: string, b: string) {
    return await deployMock(hre, {
      name,
      contract: 'MockUniswapV2PriceSource',
      args: [a, b] as MockUniswapV2PriceSourceArgs,
    });
  };
}

export async function saveMockDeployment(hre: HardhatRuntimeEnvironment, name: string, data: DeploymentConfig) {
  await hre.deployments.save(name, {
    abi: [],
    address: constants.AddressZero,
    linkedData: data,
  });
}

export async function loadMockDeployment(hre: HardhatRuntimeEnvironment, name: string): Promise<DeploymentConfig> {
  const deployment = await hre.deployments.get(name);
  return deployment.linkedData;
}

export async function hasMockDeployment(hre: HardhatRuntimeEnvironment, name: string): Promise<boolean> {
  return !!(await hre.deployments.getOrNull(name));
}

const fn = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
