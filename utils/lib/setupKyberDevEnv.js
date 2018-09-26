import { updateCanonicalPriceFeed } from "./updatePriceFeed";
import { deployContract } from "./contracts";
import governanceAction from "./governanceAction";
import web3 from "./web3";
import { swapTokensSignature } from "./data";

const BigNumber = require("bignumber.js");

/* eslint no-bitwise: ["error", { "allow": ["&"] }] */
function bytesToHex(byteArray) {
    const strNum =  Array.from(byteArray, (byte) => (`0${  (byte & 0xff).toString(16)}`).slice(-2)).join("");
    const num = `0x${  strNum}`;
    return num;
}

async function setupKyberDevEnv(deployed, accounts, opts) { 
 // Setup Kyber env
  
 const minimalRecordResolution = 2;
 const maxPerBlockImbalance = new BigNumber(10 ** 29);
 const validRateDurationInBlocks = 50;
 const precisionUnits = (new BigNumber(10).pow(18));
 const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
 const maxTotalImbalance = maxPerBlockImbalance.mul(12);

 // base buy and sell rates (prices)
 let baseBuyRate1 = [];
 let baseSellRate1 = [];

 // compact data.
 const sells = [bytesToHex(0)];
 const buys = [bytesToHex(0)];
 const indices = [0];
 deployed.ConversionRates = await deployContract(
  "exchange/thirdparty/kyber/ConversionRates",
  opts,
  [accounts[0]]
  );
  const ethToken = deployed.EthToken;
  const mlnToken = deployed.MlnToken;
  const eurToken = deployed.EurToken;
  deployed.KGTToken = await deployContract("exchange/thirdparty/kyber/TestToken", opts, ["KGT", "KGT", 18]);
  await deployed.ConversionRates.methods.setValidRateDurationInBlocks(validRateDurationInBlocks).send();
  await deployed.ConversionRates.methods.addToken(mlnToken.options.address).send();
  await deployed.ConversionRates.methods.setTokenControlInfo(mlnToken.options.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance).send();
  await deployed.ConversionRates.methods.enableTokenTrade(mlnToken.options.address).send();
  deployed.KyberNetwork = await deployContract(
    "exchange/thirdparty/kyber/KyberNetwork",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "exchange/thirdparty/kyber/KyberReserve",
    opts,
    [deployed.KyberNetwork.options.address, deployed.ConversionRates.options.address, accounts[0]]
  );
  await deployed.ConversionRates.methods.setReserveAddress(deployed.KyberReserve.options.address).send();
  await deployed.KyberNetwork.methods.addReserve(deployed.KyberReserve.options.address, true).send();
  await deployed.KyberReserve.methods.approveWithdrawAddress(mlnToken.options.address, accounts[0], true).send();
  await deployed.KyberReserve.methods.enableTrade().send();

  // Set pricing for Token
  await mlnToken.methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send();
  await updateCanonicalPriceFeed(deployed);
  const [mlnPrice] =
    Object.values(await deployed.CanonicalPriceFeed.methods.getPrice(mlnToken.options.address).call()).map(e => new BigNumber(e).toFixed(0));
  const ethersPerToken = mlnPrice;
  const tokensPerEther = precisionUnits.mul(precisionUnits).div(ethersPerToken).toFixed(0);
  baseBuyRate1.push(tokensPerEther);
  baseSellRate1.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.ConversionRates.methods.setBaseRate([mlnToken.options.address], baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices).send();
  await deployed.ConversionRates.methods.setQtyStepFunction(mlnToken.options.address, [0], [0], [0], [0]).send();
  await deployed.ConversionRates.methods.setImbalanceStepFunction(mlnToken.options.address, [0], [0], [0], [0]).send();

  deployed.KyberWhiteList = await deployContract(
    "exchange/thirdparty/kyber/KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods.setCategoryCap(0, new BigNumber(10 ** 28)).send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "exchange/thirdparty/kyber/FeeBurner",
    opts,
    [accounts[0], mlnToken.options.address, deployed.KyberNetwork.options.address]
  );
  deployed.ExpectedRate = await deployContract(
    "exchange/thirdparty/kyber/ExpectedRate",
    opts,
    [deployed.KyberNetwork.options.address, accounts[0]]
  );

  deployed.KyberNetworkProxy = await deployContract(
    "exchange/thirdparty/kyber/KyberNetworkProxy",
    opts,
    [accounts[0]]
  );

  await web3.eth.sendTransaction({to: deployed.KyberReserve.options.address, from: accounts[0], value: new BigNumber(10 ** 25)});
  await deployed.KyberReserve.methods.setContracts(deployed.KyberNetwork.options.address, deployed.ConversionRates.options.address, 0).send();
  await deployed.KyberNetworkProxy.methods.setKyberNetworkContract(deployed.KyberNetwork.options.address).send();
  await deployed.KyberNetwork.methods.setWhiteList(deployed.KyberWhiteList.options.address).send();
  await deployed.KyberNetwork.methods.setExpectedRate(deployed.ExpectedRate.options.address).send();
  await deployed.KyberNetwork.methods.setFeeBurner(deployed.FeeBurner.options.address).send();
  await deployed.KyberNetwork.methods.setKyberProxy(deployed.KyberNetworkProxy.options.address).send();
  await deployed.KyberNetwork.methods.setEnable(true).send();
  await deployed.KyberNetwork.methods.listPairForReserve(deployed.KyberReserve.options.address, mlnToken.options.address, true, true, true).send();

  await deployed.ConversionRates.methods.addToken(eurToken.options.address).send();
  await deployed.ConversionRates.methods.setTokenControlInfo(eurToken.options.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance).send();
  await deployed.ConversionRates.methods.enableTokenTrade(eurToken.options.address).send();
  await deployed.KyberReserve.methods.approveWithdrawAddress(eurToken.options.address, accounts[0], true).send();
  await eurToken.methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send();
  const [eurPrice] =
    Object.values(await deployed.CanonicalPriceFeed.methods.getPrice(eurToken.options.address).call()).map(e => new BigNumber(e).toFixed(0));
  const ethersPerEurToken = eurPrice;
  const eurTokensPerEther = precisionUnits.mul(precisionUnits).div(ethersPerToken).toFixed(0);
  await deployed.ConversionRates.methods.setBaseRate([eurToken.options.address], [eurTokensPerEther], [eurTokensPerEther], buys, sells, currentBlock, indices).send();
  await deployed.ConversionRates.methods.setQtyStepFunction(eurToken.options.address, [0], [0], [0], [0]).send();
  await deployed.ConversionRates.methods.setImbalanceStepFunction(eurToken.options.address, [0], [0], [0], [0]).send();
  await deployed.KyberNetwork.methods.listPairForReserve(deployed.KyberReserve.options.address, eurToken.options.address, true, true, true).send();

  // Melon Fund env
  deployed.KyberAdapter = await deployContract(
    "exchange/adapter/KyberAdapter", opts
  );
  await governanceAction(
    { from: accounts[0] },
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      deployed.KyberNetworkProxy.options.address,
      deployed.KyberAdapter.options.address,
      true,
      [swapTokensSignature],
    ],
  );
}

export { bytesToHex, setupKyberDevEnv };
  