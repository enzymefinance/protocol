const rp = require('request-promise');
const fs = require('fs');
const thirdpartyDir = './thirdparty';

const artifacts = {
  kyber: [
    'ConversionRates',
    'ExpectedRate',
    'FeeBurner',
    'KyberNetwork',
    'KyberNetworkProxy',
    'KyberReserve',
    'WhiteList',
  ],
  oasis: [
    'MatchingMarket',
  ],
  zeroExV2: [
    'ERC20Proxy',
    'Exchange',
  ],
  zeroExV3: [
    'Exchange',
    'Staking',
    'StakingProxy',
    'ZrxVault'
  ],
  airSwap: [
    'Swap',
    'Types',
    'ERC20TransferHandler',
    'TransferHandlerRegistry'
  ]
}

const request = (projectName, contractName) => {
  const options =  {
    uri: `https://raw.githubusercontent.com/melonproject/thirdparty-artifacts/0484d5a3ac51f25f7f8bcd639dfeb0ecbd000fb0/artifacts/${projectName}/${contractName}.json`
  }
  return rp(options);
};

function mkdir(dir) {
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
}

async function wrapRequest(request, projectName, contractName) {
  return { projectName, contractName, content: (await request(projectName, contractName)) };
}

(async () => {
  const requests = Object.entries(artifacts)
    .map(([projectName, contractNames]) => (
      contractNames.map(name => wrapRequest(request, projectName, name))
    ))
    .reduce((a, b) => a.concat(b), []);

  try {
    const results = await Promise.all(requests);
    mkdir(thirdpartyDir);
    for (const result of results) {
      const { projectName, contractName, content } = result;

      mkdir(`${thirdpartyDir}/${projectName}`);
      fs.writeFileSync(`${thirdpartyDir}/${projectName}/${contractName}.json`, content);
    }
  }
  catch (e) {
    console.log(e)
  }
})();
