import * as fs from "fs";
import * as path from "path";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
import {deployContract, retrieveContract} from "../lib/contracts";
import web3 from "../lib/web3";

const BigNumber = require("bignumber.js");

// Constants and mocks
const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";

async function tempDeploy(contractPath, options, constructorArgs) {
  const outPath = path.join(__dirname, '..', '..', 'out');
  const abiPath = path.resolve(outPath, contractPath);
  const binPath = path.resolve(outPath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${abiPath}.abi`, 'utf8'));
  const bytecode = fs.readFileSync(`${binPath}.bin`, 'utf8');
  const contract = new web3.eth.Contract(abi, options);
  const deployTx = await contract.deploy({data: bytecode, arguments: constructorArgs});
  const deployedContract = await deployTx.send(options);
  console.log(`Deployed ${contractPath}\nat ${deployedContract.options.address}\n`);
  return deployedContract;
}

async function tempRetrieve(contractPath, address) {
  const outPath = path.join(__dirname, '..', '..', 'out');
  const abiPath = path.resolve(outPath, contractPath);
  const abi = JSON.parse(fs.readFileSync(`${abiPath}.abi`, 'utf8'));
  return new web3.eth.Contract(abi, address);
}

async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  const accounts = await web3.eth.getAccounts();
  const opts = {
    from: accounts[0],
    gas: 8000000,
    gasPrice: config.gasPrice,
  };
  const deployed = {};

  if (environment === "development") {
    const accountingFactory = await tempDeploy("factory/AccountingFactory", opts);
    const feeManagerFactory = await tempDeploy("factory/FeeManagerFactory", opts);
    const participationFactory = await tempDeploy("factory/ParticipationFactory", opts);
    const sharesFactory = await tempDeploy("factory/SharesFactory", opts);
    const tradingFactory = await tempDeploy("factory/TradingFactory", opts);
    const vaultFactory = await tempDeploy("factory/VaultFactory", opts);
    const policyManagerFactory = await tempDeploy("factory/PolicyManagerFactory", opts);
    const fundFactory = await tempDeploy("factory/FundFactory", opts, [
      accountingFactory.options.address,
      feeManagerFactory.options.address,
      participationFactory.options.address,
      sharesFactory.options.address,
      tradingFactory.options.address,
      vaultFactory.options.address,
      policyManagerFactory.options.address
    ]);
    const quoteAsset = await tempDeploy("dependencies/PreminedToken", opts);
    console.log(quoteAsset.options.address)
    const testingPriceFeed = await tempDeploy("prices/TestingPriceFeed", opts, [
      quoteAsset.options.address, 18
    ]);

    await fundFactory.methods.setupFund(
      [], [], [quoteAsset.options.address], [], testingPriceFeed.options.address
    ).send(opts);
    const hubAddress = await fundFactory.methods.getFundById(0).call();
    console.log(`Hub address: ${hubAddress}`);
    const hub = await tempRetrieve("fund/hub/Hub", hubAddress);
    const sharesAddress = await hub.methods.shares().call();
    console.log(`Shares: ${sharesAddress}`);
    const shares = await tempRetrieve("fund/shares/Shares", sharesAddress);

    await testingPriceFeed.methods.update([quoteAsset.options.address],[10**18]).send(opts);

    const participationAddress = await hub.methods.participation().call();
    console.log(`Participation: ${participationAddress}`);
    const participation = await tempRetrieve("fund/participation/Participation", participationAddress);

    const amt = 10**18;
    await quoteAsset.methods.approve(participation.options.address, amt).send(opts);
    await participation.methods.requestInvestment(amt, amt, quoteAsset.options.address).send(opts);
    await participation.methods.executeRequest().send(opts);
    let supply = await shares.methods.totalSupply().call();
    console.log(`Supply after invest: ${supply}`);
    await participation.methods.redeem().send(opts);
    supply = await shares.methods.totalSupply().call();
    console.log(`Supply after redeem: ${supply}`);
  }
  return deployed;
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
      .catch(err => console.error(err.stack))
      .finally(() => process.exit())
  }
}

export default deployEnvironment;

