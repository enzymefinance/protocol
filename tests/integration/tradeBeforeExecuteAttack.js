import test from "ava";
import api from "../../utils/lib/api";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import getSignatureParameters from "../../utils/lib/getSignatureParameters";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let fund;
let gasPrice;
let investor;
let manager;
let pricefeed;
let txId;
let runningGasTotal;
let SimpleMarket;
let MatchingMarket;
let exchanges;
let trade1;
let trade2;
let trade3;
let trade4;
let version;
let deployed;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  gasPrice = Number(await api.eth.gasPrice());
  [deployer, manager, investor] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  SimpleMarket = await deployed.SimpleMarket;
  MatchingMarket = await deployContract(
    "exchange/thirdparty/MatchingMarket",
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }, // TODO: remove unnecessary params
    [1546304461],
  );
  const [r, s, v] = await getSignatureParameters(manager);
  let txid = await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test fund", // name
      deployed.MlnToken.address, // reference asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [MatchingMarket.address],
      [deployed.SimpleAdapter.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
  await MatchingMarket.instance.addTokenPairWhitelist.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [deployed.MlnToken.address, deployed.EthToken.address],
  );

  // give initial MLN to appropriate parties
  await deployed.MlnToken.instance.transfer.postTransaction(
    {from: deployer}, [investor, new BigNumber(10 ** 24), ""]
  );
  await deployed.MlnToken.instance.transfer.postTransaction(
    { from: deployer },[manager, new BigNumber(10 ** 24), ""],
  );
});

test.serial("manager invests in own fund", async t => {
  const offeredValue = new BigNumber(10**18);
  const wantedShares = new BigNumber(10**18);
  const boostedOffer = offeredValue.times(1.01); // account for increasing share price after trades occur
  let managerGasTotal = new BigNumber(0);
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await deployed.MlnToken.instance.approve.postTransaction(
    { from: manager, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, boostedOffer],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  managerGasTotal = managerGasTotal.plus(gasUsed);
  txId = await fund.instance.requestInvestment.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [boostedOffer, wantedShares, deployed.MlnToken.address],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  managerGasTotal = managerGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const totalSupply = await fund.instance.totalSupply.call({}, []);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  txId = await fund.instance.executeRequest.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  managerGasTotal = managerGasTotal.plus(gasUsed);
  // set approved token back to zero
  txId = await deployed.MlnToken.instance.approve.postTransaction(
    { from: manager },
    [fund.address, 0],
  );
  managerGasTotal = managerGasTotal.plus(
    (await api.eth.getTransactionReceipt(txId)).gasUsed,
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call({}, []),
  );
  const feesShareQuantity = parseInt(
    unclaimedFees
      .mul(totalSupply)
      .div(gav)
      .toNumber(),
    0,
  );
  let sharePrice = await fund.instance.calcValuePerShare.call({}, [
    gav,
    totalSupply.add(feesShareQuantity),
  ]);
  if (sharePrice.toNumber() === 0) {
    sharePrice = new BigNumber(10 ** 18);
  }
  const estimatedMlnSpent = wantedShares
    .times(sharePrice)
    .dividedBy(new BigNumber(10 ** 18));

  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(managerGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken.minus(estimatedMlnSpent));
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(estimatedMlnSpent));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('investor approves MLN to fund, and manager tries to trade it', async t => {
  const sellQuantity = 10 * 10 ** 18;
  const buyQuantity = 10 * 10 ** 18;
  const pre = await getAllBalances(deployed, accounts, fund);
  await deployed.MlnToken.instance.approve.postTransaction(
    { from: investor }, [fund.address, new BigNumber(10 * 10 ** 18)],
  );
  await fund.instance.requestInvestment.postTransaction(
    { from: investor },
    [
      new BigNumber(10 * 10 ** 18),
      new BigNumber(10 * 10 ** 18),
      deployed.MlnToken.address
    ]
  );

  let txid = await fund.instance.makeOrder.postTransaction(
    {from: manager},
    [
      0,
      deployed.MlnToken.address,
      deployed.EthToken.address,
      sellQuantity,
      buyQuantity
    ]
  );
  console.log(await api.eth.getTransactionReceipt(txid))
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(pre.fund.MlnToken, post.fund.MlnToken);
});

