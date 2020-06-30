const path = require('path');
const rp = require('request-promise');
const fs = require('fs');
const outDir = path.join(__dirname, '..', 'out');

const baseUrl = 'https://raw.githubusercontent.com/melonproject/thirdparty-artifacts';
const commitHash = '41ba296bb60c6bfe4aab7d8139a983c32f78b114';

// per-project mapping of actual contract names to the names we use
const artifacts = {
  kyber: {
    'KyberNetworkProxy': 'KyberNetworkProxy',
  },
  kyberMock: {
    'MockKyberNetwork': 'MockKyberNetwork',
  },
  oasis: {
    'MatchingMarket': 'OasisDexExchange',
  },
  zeroExV2: {
    'ERC20Proxy': 'ZeroExV2ERC20Proxy',
    'Exchange': 'ZeroExV2Exchange',
  },
  zeroExV3: {
    'Exchange': 'ZeroExV3Exchange',
    'Staking': 'ZeroExV3Staking',
    'StakingProxy': 'ZeroExV3StakingProxy',
    'ZrxVault': 'ZeroExV3ZrxVault'
  },
  airSwap: {
    'Swap': 'AirSwapSwap',
    'Types': 'AirSwapTypes',
    'ERC20TransferHandler': 'AirSwapERC20TransferHandler',
    'TransferHandlerRegistry': 'AirSwapTransferHandlerRegistry'
  },
  uniswap: {
    'UniswapExchange': 'UniswapExchange',
    'UniswapFactory': 'UniswapFactory'
  }
}

const mkdir = dir => !fs.existsSync(dir) && fs.mkdirSync(dir);

const request = (projectName, contractName) => {
  const options = {
    uri: `${baseUrl}/${commitHash}/artifacts/${projectName}/${contractName}.json`
  };

  return rp(options);
};

const wrapRequest = async (
  request,
  projectName,
  originalContractName,
  outputContractName
) => {
  return {
    projectName,
    outputContractName,
    content: (await request(projectName, originalContractName))
  };
}

(async () => {
  const requests = Object.entries(artifacts)
    .map(([projectName, contractNameMappings]) => (
      Object.entries(contractNameMappings).map(
        ([originalName, outputName]) => wrapRequest(
          request, projectName, originalName, outputName
        )
      )
    )
  ).reduce((a,b) => a.concat(b), []);

  try {
    mkdir(outDir);
    const results = await Promise.all(requests);
    for (const result of results) {
      const { outputContractName, content } = result;
      fs.writeFileSync(`${outDir}/${outputContractName}.json`, content);
    }
  }
  catch (e) {
    console.error(e)
  }
})();
