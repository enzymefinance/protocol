import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { swapTokensSignature } from "../../utils/lib/data";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const environmentConfig = require("../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];

/* eslint no-bitwise: ["error", { "allow": ["&"] }] */
const bytesToHex = byteArray => {
  const strNum = Array.from(byteArray, byte =>
    `0${(byte & 0xff).toString(16)}`.slice(-2)
  ).join("");
  const num = `0x${strNum}`;
  return num;
};

// hoisted variables
let accounts;
let deployed = {};
let opts;
let mlnPrice;

const minimalRecordResolution = 2;
const maxPerBlockImbalance = new BigNumber(10 ** 29);
const validRateDurationInBlocks = 50;
const precisionUnits = new BigNumber(10).pow(18);
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const maxTotalImbalance = maxPerBlockImbalance.mul(12);

// base buy and sell rates (prices)
let baseBuyRate1 = [];
let baseSellRate1 = [];

// compact data.
const sells = [bytesToHex(0)];
const buys = [bytesToHex(0)];
const indices = [0];

let deployer;
let manager;
let investor;
let fund;
let ethToken;
let mlnToken;
let eurToken;

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
  deployed = await deployEnvironment(environment);

  // Setup Kyber env
  deployed.ConversionRates = await deployContract(
    "exchange/thirdparty/kyber/ConversionRates",
    opts,
    [accounts[0]]
  );
  ethToken = deployed.EthToken;
  mlnToken = deployed.MlnToken;
  eurToken = deployed.EurToken;
  deployed.KGTToken = await deployContract(
    "exchange/thirdparty/kyber/TestToken",
    opts,
    ["KGT", "KGT", 18]
  );
  await deployed.ConversionRates.methods
    .setValidRateDurationInBlocks(validRateDurationInBlocks)
    .send();
  await deployed.ConversionRates.methods
    .addToken(mlnToken.options.address)
    .send();
  await deployed.ConversionRates.methods
    .setTokenControlInfo(
      mlnToken.options.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance
    )
    .send();
  await deployed.ConversionRates.methods
    .enableTokenTrade(mlnToken.options.address)
    .send();
  deployed.KyberNetwork = await deployContract(
    "exchange/thirdparty/kyber/KyberNetwork",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "exchange/thirdparty/kyber/KyberReserve",
    opts,
    [
      deployed.KyberNetwork.options.address,
      deployed.ConversionRates.options.address,
      accounts[0]
    ]
  );
  await deployed.ConversionRates.methods
    .setReserveAddress(deployed.KyberReserve.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .addReserve(deployed.KyberReserve.options.address, true)
    .send();
  await deployed.KyberReserve.methods
    .approveWithdrawAddress(mlnToken.options.address, accounts[0], true)
    .send();
  await deployed.KyberReserve.methods.enableTrade().send();

  // Set pricing for Token
  await mlnToken.methods
    .transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26))
    .send();
  await updateCanonicalPriceFeed(deployed);
  [mlnPrice] = Object.values(
    await deployed.CanonicalPriceFeed.methods
      .getPrice(mlnToken.options.address)
      .call()
  ).map(e => new BigNumber(e).toFixed(0));
  const ethersPerToken = mlnPrice;
  const tokensPerEther = precisionUnits
    .mul(precisionUnits)
    .div(ethersPerToken)
    .toFixed(0);
  baseBuyRate1.push(tokensPerEther);
  baseSellRate1.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.ConversionRates.methods
    .setBaseRate(
      [mlnToken.options.address],
      baseBuyRate1,
      baseSellRate1,
      buys,
      sells,
      currentBlock,
      indices
    )
    .send();
  await deployed.ConversionRates.methods
    .setQtyStepFunction(mlnToken.options.address, [0], [0], [0], [0])
    .send();
  await deployed.ConversionRates.methods
    .setImbalanceStepFunction(mlnToken.options.address, [0], [0], [0], [0])
    .send();

  deployed.KyberWhiteList = await deployContract(
    "exchange/thirdparty/kyber/KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods
    .setCategoryCap(0, new BigNumber(10 ** 28))
    .send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "exchange/thirdparty/kyber/FeeBurner",
    opts,
    [
      accounts[0],
      mlnToken.options.address,
      deployed.KyberNetwork.options.address
    ]
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

  await web3.eth.sendTransaction({
    to: deployed.KyberReserve.options.address,
    from: accounts[0],
    value: new BigNumber(10 ** 25)
  });
  await deployed.KyberReserve.methods
    .setContracts(
      deployed.KyberNetwork.options.address,
      deployed.ConversionRates.options.address,
      0
    )
    .send();
  await deployed.KyberNetworkProxy.methods
    .setKyberNetworkContract(deployed.KyberNetwork.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setWhiteList(deployed.KyberWhiteList.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setExpectedRate(deployed.ExpectedRate.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setFeeBurner(deployed.FeeBurner.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setKyberProxy(deployed.KyberNetworkProxy.options.address)
    .send();
  await deployed.KyberNetwork.methods.setEnable(true).send();
  await deployed.KyberNetwork.methods
    .listPairForReserve(
      deployed.KyberReserve.options.address,
      mlnToken.options.address,
      true,
      true,
      true
    )
    .send();

  // Melon Fund env
  deployed.KyberAdapter = await deployContract(
    "exchange/adapter/KyberAdapter",
    opts
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
      [swapTokensSignature]
    ]
  );
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.Version.methods
    .setupFund(
      web3.utils.toHex("Suisse Fund"),
      deployed.EthToken.options.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.options.address,
      deployed.RMMakeOrders.options.address,
      [deployed.KyberNetworkProxy.options.address],
      [],
      v,
      r,
      s
    )
    .send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });
  const fundAddress = await deployed.Version.methods
    .managerToFunds(manager)
    .call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition.options.address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods
    .changeCompetitionAddress(investor)
    .send({ from: deployer, gas: config.gas, gasPrice: config.gasPrice });
});

const initialTokenAmount = new BigNumber(10 ** 20);
test.serial("investor receives initial ethToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods
    .transfer(investor, initialTokenAmount)
    .send({ from: deployer, gasPrice: config.gasPrice });
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount)
  );
});

// mock data
const offeredValue = new BigNumber(10 ** 20);
const wantedShares = new BigNumber(10 ** 20);
test.serial(
  "fund receives ETH from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods
      .approve(fund.options.address, offeredValue)
      .send({ from: investor, gasPrice: config.gasPrice, gas: config.gas });
    await fund.methods
      .requestInvestment(offeredValue, wantedShares, ethToken.options.address)
      .send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
    const requestId = await fund.methods.getLastRequestId().call();
    await fund.methods
      .executeRequest(requestId)
      .send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue)
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

/*
test.skip("test", async t => {
   // await deployed.KyberReserve.methods.setContracts(accounts[0], deployed.ConversionRates.options.address, 0).send();
   // await deployed.KyberReserve.methods.trade(ethAddress, new BigNumber(10 ** 16), mlnToken.options.address, accounts[0], new BigNumber(10 ** 17), false).send({from: accounts[0], gasPrice: 1, value: new BigNumber(10 ** 16)});
   console.log(await deployed.KyberNetworkProxy.methods.getUserCapInWei(accounts[2]).call());
   console.log(await deployed.KyberNetwork.methods.findBestRate(ethAddress, mlnToken.options.address, new BigNumber(10 ** 23)).call());
  // await deployed.KyberNetworkProxy.methods.trade(ethAddress, new BigNumber(10 ** 17), mlnToken.options.address, accounts[2], new BigNumber(10 ** 28), 0, accounts[2]).send();
   await deployed.KyberNetworkProxy.methods.swapEtherToToken(mlnToken.options.address, 1).send({from: accounts[2], gasPrice: 1, value: new BigNumber(10 ** 18)});
});
*/

test.serial(
  "swap ethToken for mlnToken without minimum destAmount",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const srcAmount = new BigNumber(10 ** 17);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(ethAddress, mlnToken.options.address, srcAmount)
        .call()
    ).map(e => new BigNumber(e));
    await fund.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          "0x0",
          "0x0",
          ethToken.options.address,
          mlnToken.options.address,
          "0x0"
        ],
        [srcAmount, 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        0,
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    const expectedMln = srcAmount.mul(bestRate).div(new BigNumber(10 ** 18));
    const post = await getAllBalances(deployed, accounts, fund);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.sub(srcAmount));
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(expectedMln));
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  }
);

test.serial(
  "swap mlnToken for ethToken without mimimum destAmount",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const srcAmount = new BigNumber(10 ** 17);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(mlnToken.options.address, ethAddress, srcAmount)
        .call()
    ).map(e => new BigNumber(e));
    await fund.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          "0x0",
          "0x0",
          mlnToken.options.address,
          ethToken.options.address,
          "0x0"
        ],
        [srcAmount, 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        0,
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    const expectedEthToken = srcAmount
      .mul(bestRate)
      .div(new BigNumber(10 ** 18));
    const post = await getAllBalances(deployed, accounts, fund);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(srcAmount));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(expectedEthToken));
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  }
);

// minPrice is basically set if srcAmount is non-zero (Otherwise it's just executes at market price)
test.serial(
  "swap mlnToken for ethToken with specific order price (minRate)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const srcAmount = new BigNumber(10 ** 17);
    const destAmount = srcAmount.mul(mlnPrice).div(precisionUnits);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(mlnToken.options.address, ethAddress, srcAmount)
        .call()
    ).map(e => new BigNumber(e));
    await fund.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          "0x0",
          "0x0",
          mlnToken.options.address,
          ethToken.options.address,
          "0x0"
        ],
        [srcAmount, destAmount, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        0,
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    const expectedEthToken = srcAmount
      .mul(bestRate)
      .div(new BigNumber(10 ** 18));
    const post = await getAllBalances(deployed, accounts, fund);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(srcAmount));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(expectedEthToken));
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  }
);

test.serial(
  "swap mlnToken directly to eurToken without minimum destAmount",
  async t => {
    // Setup eurToken in Kyber
    await deployed.ConversionRates.methods
      .addToken(eurToken.options.address)
      .send();
    await deployed.ConversionRates.methods
      .setTokenControlInfo(
        eurToken.options.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance
      )
      .send();
    await deployed.ConversionRates.methods
      .enableTokenTrade(eurToken.options.address)
      .send();
    await deployed.KyberReserve.methods
      .approveWithdrawAddress(eurToken.options.address, accounts[0], true)
      .send();
    await eurToken.methods
      .transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26))
      .send();
    const [eurPrice] = Object.values(
      await deployed.CanonicalPriceFeed.methods
        .getPrice(eurToken.options.address)
        .call()
    ).map(e => new BigNumber(e).toFixed(0));
    const ethersPerToken = eurPrice;
    const tokensPerEther = precisionUnits
      .mul(precisionUnits)
      .div(ethersPerToken)
      .toFixed(0);
    const currentBlock = await web3.eth.getBlockNumber();
    await deployed.ConversionRates.methods
      .setBaseRate(
        [eurToken.options.address],
        [tokensPerEther],
        [tokensPerEther],
        buys,
        sells,
        currentBlock,
        indices
      )
      .send();
    await deployed.ConversionRates.methods
      .setQtyStepFunction(eurToken.options.address, [0], [0], [0], [0])
      .send();
    await deployed.ConversionRates.methods
      .setImbalanceStepFunction(eurToken.options.address, [0], [0], [0], [0])
      .send();
    await deployed.KyberNetwork.methods
      .listPairForReserve(
        deployed.KyberReserve.options.address,
        eurToken.options.address,
        true,
        true,
        true
      )
      .send();

    const fundPreEur = new BigNumber(
      await eurToken.methods.balanceOf(fund.options.address).call()
    );
    const pre = await getAllBalances(deployed, accounts, fund);
    const srcAmount = new BigNumber(10 ** 17);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(
          mlnToken.options.address,
          eurToken.options.address,
          srcAmount
        )
        .call()
    ).map(e => new BigNumber(e));
    await fund.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          "0x0",
          "0x0",
          mlnToken.options.address,
          eurToken.options.address,
          "0x0"
        ],
        [srcAmount, 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        0,
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    const expectedEurToken = srcAmount
      .mul(bestRate)
      .div(new BigNumber(10 ** 18));
    const fundPostEur = new BigNumber(
      await eurToken.methods.balanceOf(fund.options.address).call()
    );
    const post = await getAllBalances(deployed, accounts, fund);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(srcAmount));
    t.deepEqual(fundPostEur, fundPreEur.add(expectedEurToken));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  }
);

test.serial("swapTokens fails if minPrice is not satisfied", async t => {
  const srcAmount = new BigNumber(10 ** 17);
  const destAmount = srcAmount.mul(mlnPrice * 2).div(precisionUnits);
  await t.throws(
    fund.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          "0x0",
          "0x0",
          mlnToken.options.address,
          ethToken.options.address,
          "0x0"
        ],
        [srcAmount, destAmount, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        0,
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas })
  );
});

test.serial(
  "risk management prevents swap in the case of bad kyber network price",
  async t => {
    // Inflate price of mln price by 100%, RMMakeOrders only tolerates 10% deviation
    baseBuyRate1 = [mlnPrice * 2];
    baseSellRate1 = [
      precisionUnits
        .mul(precisionUnits)
        .div(baseBuyRate1)
        .toFixed(0)
    ];
    const currentBlock = await web3.eth.getBlockNumber();
    await deployed.ConversionRates.methods
      .setBaseRate(
        [mlnToken.options.address],
        baseBuyRate1,
        baseSellRate1,
        buys,
        sells,
        currentBlock,
        indices
      )
      .send();
    const srcAmount = new BigNumber(10 ** 17);
    await t.throws(
      fund.methods
        .callOnExchange(
          0,
          swapTokensSignature,
          [
            "0x0",
            "0x0",
            ethToken.options.address,
            mlnToken.options.address,
            "0x0"
          ],
          [srcAmount, 0, 0, 0, 0, 0, 0, 0],
          web3.utils.padLeft("0x0", 64),
          0,
          web3.utils.padLeft("0x0", 64),
          web3.utils.padLeft("0x0", 64)
        )
        .send({ from: manager, gas: config.gas })
    );
  }
);
