import test from "ava";
import api from "../../utils/lib/api";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

BigNumber.config({ ERRORS: false });

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let investor;
let manager;
let mlnToken;
let pricefeed;
let simpleMarketWithApprove;
let trade1;
let version;
let deployed;
let opts;

const makeOrderSignature = api.util
  .abiSignature("makeOrder", [
    "address",
    "address[5]",
    "uint256[8]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

// mock data
const offeredValue = new BigNumber(10 ** 21);
const wantedShares = new BigNumber(10 ** 21);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, ,] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  simpleMarketWithApprove = await deployContract(
    "exchange/thirdparty/SimpleMarketWithApprove",
    opts,
  );
  await governanceAction(
    opts,
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      simpleMarketWithApprove.options.address,
      deployed.MatchingMarketAdapter.options.address,
      false,
      [makeOrderSignature],
    ],
  );
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex("Suisse Fund"),
    deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [simpleMarketWithApprove.options.address],
    [],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(investor).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );

  // investment
  const initialTokenAmount = new BigNumber(10 ** 22);
  await ethToken.methods.transfer(investor, initialTokenAmount).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  await ethToken.methods.approve(fund.options.address, offeredValue).send(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas }
  );
  await fund.methods.requestInvestment(offeredValue, wantedShares, ethToken.options.address).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestId = await fund.methods.getLastRequestId().call();
  await fund.methods.executeRequest(requestId).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);

  const [
    ,
    referencePrice,
  ] = Object.values(await pricefeed.methods.getReferencePriceInfo(
    ethToken.options.address,
    mlnToken.options.address,
  ).call());
  const sellQuantity1 = new BigNumber(10 ** 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(referencePrice).dividedBy(10 ** 18).times(sellQuantity1),
  };
});

test.serial(
  "Manager makes an order through simple exchange adapter (with approve)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await updateCanonicalPriceFeed(deployed);
    await fund.methods.callOnExchange(
      0,
      makeOrderSignature,
      ["0x0", "0x0", ethToken.options.address, mlnToken.options.address, "0x0"],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      web3.utils.padLeft('0x0', 64),
      0,
      web3.utils.padLeft('0x0', 64),
      web3.utils.padLeft('0x0', 64),
    ).send(
      { from: manager, gas: config.gas }
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const fundsApproved = await ethToken.methods.allowance(
      fund.options.address,
      simpleMarketWithApprove.options.address,
    ).call();
    const heldinExchange = await fund.methods.quantityHeldInCustodyOfExchange(ethToken.options.address).call();
    t.is(Number(heldinExchange), 0);
    t.deepEqual(Number(fundsApproved), Number(trade1.sellQuantity));
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Third party takes the order", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await simpleMarketWithApprove.methods.last_offer_id().call();
  const exchangePreEthToken = Number(
    await ethToken.methods.balanceOf(
      simpleMarketWithApprove.options.address,
    ).call(),
  );
  await mlnToken.methods.approve(simpleMarketWithApprove.options.address, trade1.buyQuantity).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  await simpleMarketWithApprove.methods.buy(orderId, trade1.sellQuantity).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
  const exchangePostMln = Number(
    await mlnToken.methods.balanceOf(
      simpleMarketWithApprove.options.address,
    ).call(),
  );
  const exchangePostEthToken = Number(
    await ethToken.methods.balanceOf(
      simpleMarketWithApprove.options.address,
    ).call(),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(exchangePostMln, 0);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.buyQuantity),
  );
  t.deepEqual(
    post.deployer.EthToken,
    pre.deployer.EthToken.add(trade1.sellQuantity),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.buyQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.sellQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
