import 'dotenv/config';
import '@enzymefinance/hardhat/plugin';

import { utils } from 'ethers';
import { HardhatUserConfig } from 'hardhat/types';

function node(networkName: string) {
  const fallback = 'http://localhost:8545';
  const uppercase = networkName.toUpperCase();
  const uri = process.env[`ETHEREUM_NODE_${uppercase}`] || process.env.ETHEREUM_NODE || fallback;
  return uri.replace('{{NETWORK}}', networkName);
}

function accounts(networkName: string) {
  const uppercase = networkName.toUpperCase();
  const accounts = process.env[`ETHEREUM_ACCOUNTS_${uppercase}`] || process.env.ETHEREUM_ACCOUNTS || '';
  return accounts
    .split(',')
    .map((account) => account.trim())
    .filter(Boolean);
}

const mnemonic = 'test test test test test test test test test test test junk';

const config: HardhatUserConfig = {
  codeCoverage: {
    exclude: ['/mock/i'], // Ignore anything with the word "mock" in it.
  },
  codeGenerator: {
    abi: {
      path: './packages/protocol/artifacts',
    },
    bytecode: {
      path: './packages/protocol/artifacts',
    },
    clear: true,
    enabled: true,
    include: [
      // Explicitly allow inclusion of core release interfaces.
      'IDerivativePriceFeed',
      'IExtension',
      'IIntegrationAdapter',
      'IFee',
      'IPolicy',
      'IPrimitivePriceFeed',

      // TODO: Re-evaluate whether we should include these at all.
      'IMigrationHookHandler',
      'IMigratableVault',
      'IAlphaHomoraV1Bank',
      'IIdleTokenV4',
      'IChainlinkAggregator',
      'IMakerDaoPot',
      'IUniswapV2Factory',
      'IUniswapV2Pair',
      'IUniswapV2Router2',
      'IKyberNetworkProxy',
      'ICERC20',
      'ICEther',
      'ISynthetix',
      'ISynthetixAddressResolver',
      'ISynthetixDelegateApprovals',
      'ISynthetixExchangeRates',
      'ISynthetixExchanger',
      'ISynthetixProxyERC20',
      'ISynthetixSynth',
      'ICurveAddressProvider',
      'ICurveLiquidityGaugeV2',
      'ICurveLiquidityPool',
      'ICurveRegistry',
      'ICurveStableSwapSteth',
      'IYearnVaultV2',
    ],
    options: {
      ignoreContractsWithoutAbi: true,
      ignoreContractsWithoutBytecode: true,
    },
    typescript: {
      path: './packages/protocol/src/codegen',
    },
  },
  contractSizer: {
    disambiguatePaths: false,
  },
  namedAccounts: {
    deployer: 0,
  },
  networks: {
    hardhat: {
      hardfork: 'istanbul',
      accounts: {
        accountsBalance: utils.parseUnits('1', 36).toString(),
        count: 5,
        mnemonic,
      },
      forking: {
        blockNumber: 12540501,
        url: node('mainnet'), // May 31, 2021
      },
      gas: 9500000,
      gasPrice: 0, // TODO: Consider removing this again.
      ...(process.env.COVERAGE && {
        allowUnlimitedContractSize: true,
      }),
    },
    kovan: {
      hardfork: 'istanbul',
      accounts: accounts('kovan'),
      url: node('kovan'),
    },
    mainnet: {
      hardfork: 'istanbul',
      accounts: accounts('mainnet'),
      url: node('mainnet'),
    },
  },
  paths: {
    deploy: 'deploy/scripts',
  },
  solidity: {
    settings: {
      optimizer: {
        details: {
          yul: false,
        },
        enabled: true,
        runs: 200,
      },
    },
    version: '0.6.12',
  },
};

export default config;
