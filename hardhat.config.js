require('@crestproject/hardhat/plugin');
require('hardhat-contract-sizer');

module.exports = {
  solidity: {
    version: '0.6.8',
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
      'IExtension',
      'IIntegrationAdapter',
      'IFee',
      'IPolicy',

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
