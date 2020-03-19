const rp = require('request-promise');
const fs = require('fs');

const thirdpartyDir = './thirdparty';

const contractNames = [
  'ConversionRates',
  'ExpectedRate',
  'FeeBurner',
  'KyberNetwork',
  'KyberNetworkProxy',
  'KyberReserve',
  'OasisDexExchange',
  'UniswapExchange',
  'UniswapFactory',
  'WhiteList',
  'ZeroExV2ERC20Proxy',
  'ZeroExV2Exchange',
  'ZeroExV3ERC20Proxy',
  'ZeroExV3Exchange',
  'ZeroExV3Staking',
  'ZeroExV3StakingProxy',
  'ZeroExV3ZrxVault'
];

const requestOptions = (fileExtension) => (contractName) => {
  return {
    uri: `https://raw.githubusercontent.com/melonproject/thirdparty-artifacts/master/thirdparty/${contractName}${fileExtension}`
  }
};

const abiRequestOptions = requestOptions('.abi');
const bytecodeRequestOptions = requestOptions('.bin');

function mkdir(dir) {
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
}

async function wrapRequestResult(request, contractName, fileExtension) {
  const result = await request;

  return {
    contractName,
    fileExtension,
    content: result
  };
}

(async () => {

  const requests = [];
  for (const cName of contractNames) {
    {
      const request = rp(abiRequestOptions(cName));
      const abiReq = wrapRequestResult(request, cName, '.abi');
      requests.push(abiReq);
    }
    {
      const request = rp(bytecodeRequestOptions(cName));
      const bytecodeReq = wrapRequestResult(request, cName, '.bin');
      requests.push(bytecodeReq);
    }
  }

  const results = await Promise.all(requests);
  mkdir(thirdpartyDir);
  for (const result of results) {
    const { contractName, fileExtension, content } = result;
    fs.writeFileSync(`${thirdpartyDir}/${contractName}${fileExtension}`, content);
  }

})();
