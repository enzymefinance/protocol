import {
  FundDeployer,
  MockCEtherIntegrateeArgs,
  MockCTokenIntegrateeArgs,
  MockSynthetixTokenArgs,
  MockTokenArgs,
  MockUniswapV2PriceSourceArgs,
  ReleaseStatusTypes,
} from '@enzymefinance/protocol';
import { utils } from 'ethers';
import fs from 'fs-extra';
import { DeployFunction, DeployOptions, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

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
  return async function (symbol: string, name: string, underlying: string, rate: number) {
    return await deployMock(hre, {
      name: symbol,
      contract: 'MockCTokenIntegratee',
      args: [name, symbol, 8, underlying, centralizedRateProvider, rate] as MockCTokenIntegrateeArgs,
    });
  };
}

export function createDeployMockCompoundEther(
  hre: HardhatRuntimeEnvironment,
  centralizedRateProvider: string,
  weth: string,
) {
  return async function (symbol: string, name: string, rate: number) {
    return await deployMock(hre, {
      name: symbol,
      contract: 'MockCEtherIntegratee',
      args: [name, symbol, 8, weth, centralizedRateProvider, rate] as MockCEtherIntegrateeArgs,
    });
  };
}

export function createDeployMockUniswapPair(hre: HardhatRuntimeEnvironment, centralizedRateProvider: string) {
  return async function (name: string, a: string, b: string) {
    return await deployMock(hre, {
      name,
      contract: 'MockUniswapV2PriceSource',
      args: [centralizedRateProvider, a, b] as MockUniswapV2PriceSourceArgs,
    });
  };
}

// Finalize kovan and test deployments (set release to live, etc.).
const fn: DeployFunction = async (hre) => {
  if (!hre.network.live || hre.network.name === 'kovan') {
    const deployer = await hre.ethers.getNamedSigner('deployer');
    const fundDeployer = await hre.deployments.get('FundDeployer');
    const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);

    // NOTE: There is currently an error in the generated typescript code for enums that cause
    // this to be typed as a BigNumber although it's returned as a number.
    const currentReleaseStatus = ((await fundDeployerInstance.getReleaseStatus()) as any) as number;
    if (currentReleaseStatus === ReleaseStatusTypes.PreLaunch) {
      hre.deployments.log('Setting release status to live');
      await fundDeployerInstance.setReleaseStatus(ReleaseStatusTypes.Live);
    }
  }
};

// This needs to run as the last step of the deployment.
fn.runAtTheEnd = true;
fn.dependencies = ['FundDeployer'];

export default fn;
