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

// Set the block gas limit and default gas. When testing with code coverage reporting,
// we double the gas limit & default gas to allow for large contracts with instrumentalisation
// injected.
const coverage = JSON.parse(process.env.COVERAGE || 'false');
const gas = 12450000 * (coverage ? 2 : 1);

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
      'IExternalPosition',
      'IExternalPositionParser',
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
      'IUniswapV2Factory',
      'IUniswapV2Pair',
      'IUniswapV2Router2',
      'ICERC20',
      'ICEther',
      'ISynthetix',
      'ISynthetixAddressResolver',
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
      'IGsnRelayHub',
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
      accounts: {
        accountsBalance: utils.parseUnits('1', 36).toString(),
        count: 5,
        mnemonic,
      },
      chainId: 1,
      forking: {
        blockNumber: 12836323, // July 16, 2021
        url: node('mainnet'),
      },
      blockGasLimit: gas,
      gasPrice: 0, // TODO: Consider removing this again.
    },
    kovan: {
      accounts: accounts('kovan'),
      url: node('kovan'),
    },
    mainnet: {
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
