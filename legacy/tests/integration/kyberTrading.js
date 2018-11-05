import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { swapTokensSignature, swapTokensSignatureBytes } from "../../utils/lib/data";
import { updateTestingPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";
import getFundComponents from "../../utils/lib/getFundComponents";

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
let pricefeed;

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const minimalRecordResolution = 2;
const maxPerBlockImbalance = new BigNumber(10 ** 29).toFixed();
const validRateDurationInBlocks = 50;
const precisionUnits = new BigNumber(10 ** 18).toFixed();
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const maxTotalImbalance = new BigNumber(maxPerBlockImbalance).mul(12).toFixed();

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
  pricefeed = await deployed.TestingPriceFeed;

  // Setup Kyber env
  deployed.ConversionRates = await deployContract(
    "exchanges/thirdparty/kyber/ConversionRates",
    opts,
    [accounts[0]]
  );
  ethToken = deployed.EthToken;
  mlnToken = deployed.MlnToken;
  eurToken = deployed.EurToken;
  deployed.KGTToken = await deployContract(
    "exchanges/thirdparty/kyber/TestToken",
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
    "exchanges/thirdparty/kyber/KyberNetwork",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "exchanges/thirdparty/kyber/KyberReserve",
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
    .transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 23).toFixed())
    .send();
  await updateTestingPriceFeed(deployed);
  [mlnPrice] = Object.values(
    await pricefeed.methods
      .getPrice(mlnToken.options.address)
      .call()
  ).map(e => new BigNumber(e).toFixed(0));
  const ethersPerToken = mlnPrice;
  const tokensPerEther = new BigNumber(precisionUnits)
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
    "exchanges/thirdparty/kyber/KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods
    .setCategoryCap(0, new BigNumber(10 ** 28).toFixed())
    .send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "exchanges/thirdparty/kyber/FeeBurner",
    opts,
    [
      accounts[0],
      mlnToken.options.address,
      deployed.KyberNetwork.options.address
    ]
  );
  deployed.ExpectedRate = await deployContract(
    "exchanges/thirdparty/kyber/ExpectedRate",
    opts,
    [deployed.KyberNetwork.options.address, accounts[0]]
  );

  deployed.KyberNetworkProxy = await deployContract(
    "exchanges/thirdparty/kyber/KyberNetworkProxy",
    opts,
    [accounts[0]]
  );

  await web3.eth.sendTransaction({
    to: deployed.KyberReserve.options.address,
    from: accounts[3],
    value: new BigNumber(10 ** 19)
  });
  await deployed.KyberReserve.methods
    .setContracts(
      deployed.KyberNetwork.options.address,
      deployed.ConversionRates.options.address,
      NULL_ADDRESS
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
    "exchanges/KyberAdapter",
    opts
  );
  // TODO
  // await governanceAction(
  //   { from: accounts[0] },
  //   deployed.Governance,
  //   pricefeed,
  //   "registerExchange",
  //   [
  //     deployed.KyberNetworkProxy.options.address,
  //     deployed.KyberAdapter.options.address,
  //     true,
  //     [swapTokensSignature]
  //   ]
  // );
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.FundFactory.methods.createComponents(
    'Test Fund', [deployed.KyberNetworkProxy.options.address], [deployed.KyberAdapter.options.address], deployed.EthToken.options.address, [deployed.EthToken.options.address, deployed.MlnToken.options.address], [false], deployed.TestingPriceFeed.options.address
  ).send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.continueCreation().send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.setupFund().send({from: manager, gasPrice: config.gasPrice});
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  fund = await getFundComponents(hubAddress);
});

const initialTokenAmount = new BigNumber(10 ** 19).toFixed();
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
const offeredValue = new BigNumber(10 ** 19).toFixed();
const wantedShares = new BigNumber(10 ** 19).toFixed();
test.serial(
  "fund receives ETH from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods
      .approve(fund.participation.options.address, offeredValue)
      .send({ from: investor, gasPrice: config.gasPrice, gas: config.gas });
    await fund.participation.methods
      .requestInvestment(offeredValue, wantedShares, ethToken.options.address)
      .send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
    await fund.participation.methods
      .executeRequest()
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

test.serial(
  "swap ethToken for mlnToken without minimum destAmount",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const srcAmount = new BigNumber(10 ** 18);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(ethAddress, mlnToken.options.address, srcAmount.toFixed())
        .call()
    ).map(e => new BigNumber(e));
    await fund.trading.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          ethToken.options.address,
          mlnToken.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS        
        ],
        [srcAmount.toFixed(), 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    await fund.trading.methods.returnToVault([mlnToken.options.address]).send({ from: manager, gas: config.gas });
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
        .findBestRate(mlnToken.options.address, ethAddress, srcAmount.toFixed())
        .call()
    ).map(e => new BigNumber(e));
    await fund.trading.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          mlnToken.options.address,
          ethToken.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS
        ],
        [srcAmount.toFixed(), 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
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
    const destAmount = new BigNumber(srcAmount).mul(mlnPrice).div(precisionUnits);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(mlnToken.options.address, ethAddress, srcAmount.toFixed())
        .call()
    ).map(e => new BigNumber(e));
    await fund.trading.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          mlnToken.options.address,
          ethToken.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS
        ],
        [srcAmount.toFixed(), destAmount.toFixed(), 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
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
      .transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 24).toFixed())
      .send();
    const [eurPrice] = Object.values(
      await pricefeed.methods
        .getPrice(eurToken.options.address)
        .call()
    ).map(e => new BigNumber(e).toFixed(0));
    const ethersPerToken = eurPrice;
    const tokensPerEther = new BigNumber(precisionUnits)
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
      await eurToken.methods.balanceOf(fund.vault.options.address).call()
    );
    const srcAmount = new BigNumber(10 ** 17).toFixed();
    const pre = await getAllBalances(deployed, accounts, fund);
    const [, bestRate] = Object.values(
      await deployed.KyberNetwork.methods
        .findBestRate(
          mlnToken.options.address,
          eurToken.options.address,
          srcAmount
        )
        .call()
    ).map(e => new BigNumber(e));
    await fund.trading.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          mlnToken.options.address,
          eurToken.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS
        ],
        [srcAmount, 0, 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas });
    const expectedEurToken = new BigNumber(srcAmount)
      .mul(bestRate)
      .div(new BigNumber(10 ** 18));
    await fund.trading.methods.returnToVault([eurToken.options.address]).send(opts);
    const fundPostEur = new BigNumber(
      await eurToken.methods.balanceOf(fund.vault.options.address).call()
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

// TODO
test.serial.skip("swapTokens fails if minPrice is not satisfied", async t => {
  const srcAmount = new BigNumber(10 ** 17);
  const destAmount = srcAmount.mul(mlnPrice * 2).div(precisionUnits);
  await t.throws(
    fund.trading.methods
      .callOnExchange(
        0,
        swapTokensSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          mlnToken.options.address,
          ethToken.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS
        ],
        [srcAmount.toFixed(), destAmount.toFixed(), 0, 0, 0, 0, 0, 0],
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64),
        web3.utils.padLeft("0x0", 64)
      )
      .send({ from: manager, gas: config.gas })
  );
});

// TODO: Get back
test.serial.skip(
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
      fund.trading.methods
        .callOnExchange(
          0,
          swapTokensSignature,
          [
            NULL_ADDRESS,
            NULL_ADDRESS,
            ethToken.options.address,
            mlnToken.options.address,
            NULL_ADDRESS,
            NULL_ADDRESS
          ],
          [srcAmount.toFixed(), 0, 0, 0, 0, 0, 0, 0],
          web3.utils.padLeft("0x0", 64),
          web3.utils.padLeft("0x0", 64),
          web3.utils.padLeft("0x0", 64),
          web3.utils.padLeft("0x0", 64)
        )
        .send({ from: manager, gas: config.gas })
    );
  }
);
