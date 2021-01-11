import 'dotenv/config';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-contract-sizer';
import '@crestproject/hardhat/plugin';
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
  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: false,
        },
      },
    },
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic,
      },
      forking: {
        url: node('mainnet'),
        blockNumber: 11621050, // Jan 9, 2021
      },
    },
    mainnet: {
      url: node('mainnet'),
      accounts: accounts('mainnet'),
    },
    kovan: {
      url: node('kovan'),
      accounts: accounts('kovan'),
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  contractSizer: {
    disambiguatePaths: false,
  },
  codeGenerator: {
    enabled: true,
    clear: true,
    bytecode: {
      path: './packages/protocol/artifacts',
    },
    abi: {
      path: './packages/protocol/artifacts',
    },
    typescript: {
      path: './packages/protocol/src/codegen',
    },
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
      'IChainlinkAggregator',
      'IMakerDaoPot',
      'IUniswapV2Factory',
      'IUniswapV2Pair',
      'IUniswapV2Router2',
      'IKyberNetworkProxy',
      'ICERC20',
      'ICEther',
      'IChai',
      'ISynthetix',
      'ISynthetixAddressResolver',
      'ISynthetixDelegateApprovals',
      'ISynthetixExchangeRates',
      'ISynthetixExchanger',
      'ISynthetixProxyERC20',
      'ISynthetixSynth',
    ],
    options: {
      ignoreContractsWithoutAbi: true,
      ignoreContractsWithoutBytecode: true,
    },
  },
  codeCoverage: {
    exclude: ['/mock/i'], // Ignore anything with the word "mock" in it.
  },
};

export default config;
