import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ChainlinkRateAsset } from '@melonproject/protocol';
import { mainnetConfig } from './Mainnet';
import { loadMockDeployment } from './Mocks';

export interface DeploymentConfig {
  weth: string;
  chainlink: {
    ethusd: string;
    primitives: [string, string, ChainlinkRateAsset][];
  };
  wdgld: {
    wdgld: string;
    ethusd: string;
    xauusd: string;
  };
  synthetix: {
    snx: string;
    susd: string;
    synths: string[];
    addressResolver: string;
    delegateApprovals: string;
    originator: string;
    trackingCode: string;
  };
  compound: {
    ceth: string;
    ctokens: string[];
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
  uniswap: {
    factory: string;
    router: string;
    pools: string[];
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

export async function loadConfig(hre: HardhatRuntimeEnvironment) {
  if (hre.network.name === 'mainnet') {
    return mainnetConfig;
  }

  if (hre.network.name === 'kovan') {
    return loadMockDeployment(hre, 'Kovan');
  }

  throw new Error('Failed to load config');
}

const fn = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
