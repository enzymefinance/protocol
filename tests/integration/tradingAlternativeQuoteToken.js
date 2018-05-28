import test from "ava";
import api from "../../utils/lib/api";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import deployEnvironment from "../../utils/deploy/contracts";
import {getTermsSignatureParameters} from "../../utils/lib/signing";
import governanceAction from "../../utils/lib/governanceAction";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

BigNumber.config({ERRORS: false});

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let gasPrice;
let investor;
let manager;
let mlnToken;
let txId;
let opts;
let runningGasTotal;
let trade1;
let deployed;

// mock data
const offeredValue = new BigNumber(10 ** 22);
const wantedShares = new BigNumber(10 ** 22);

// define order signatures
const makeOrderSignature = api.util.abiSignature('makeOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const takeOrderSignature = api.util.abiSignature('takeOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const cancelOrderSignature = api.util.abiSignature('cancelOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  opts = {from: accounts[0], gas: config.gas};
  gasPrice = Number(await api.eth.gasPrice());
  [deployer, manager, investor] = accounts;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;

  // replace some of the contracts on `deployed` object
  deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
    deployed.MlnToken.address,
    deployed.EthToken.address,
    "Ether token",
    "ETH-T",
    18,
    "ethereum.org",
    "",
    ["0x0", "0x0"],
    [],
    [],
    [config.protocol.pricefeed.interval, config.protocol.pricefeed.validity],
    [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
    deployed.Governance.address
  ], () => {}, true);
  const txid = await deployed.CanonicalPriceFeed.instance.setupStakingPriceFeed.postTransaction(opts);
  const receipt = await api.eth.getTransactionReceipt(txid)
  const setupLog = receipt.logs.find(
    e => e.topics[0] === api.util.sha3('SetupPriceFeed(address)')
  );
  const stakingFeedAddress = api.util.toChecksumAddress(`0x${setupLog.data.slice(-40)}`);
  deployed.StakingPriceFeed = await retrieveContract("pricefeeds/StakingPriceFeed", stakingFeedAddress);
  const txidd = await mlnToken.instance.approve.postTransaction(
    opts,
    [
      deployed.StakingPriceFeed.address,
      config.protocol.staking.minimumAmount
    ]
  );
  await deployed.StakingPriceFeed.instance.depositStake.postTransaction(
    opts, [config.protocol.staking.minimumAmount, ""]
  );

  deployed.Version = await deployContract(
    "version/Version",
    opts,
    [
      '0.0.0', deployed.Governance.address, deployed.EthToken.address,
      deployed.CanonicalPriceFeed.address, false
    ],
    () => {}, true
  );

  await governanceAction(
    opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.MatchingMarket.address,
      deployed.MatchingMarketAdapter.address,
      true,
      [
        makeOrderSignature,
        takeOrderSignature,
        cancelOrderSignature
      ]
    ]
  );

  await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    deployed.MlnToken.address,
    "Melon token",
    "MLN-T",
    18,
    "melonport.com",
    "",
    ["0x0", "0x0"],
    [],
    []
  ]);
  await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    deployed.EurToken.address,
    "Euro token",
    "EUR-T",
    18,
    "europa.eu",
    "",
    ["0x0", "0x0"],
    [],
    []
  ]);

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.Version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas },
    [
      "Test fund",               // name
      deployed.EthToken.address, // reference asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      [deployed.MlnToken.address],
      v,
      r,
      s
    ]
  );
  const fundAddress = await deployed.Version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);

  await updateCanonicalPriceFeed(deployed, {}, 'ETH');

  const [, referencePrice] = await deployed.CanonicalPriceFeed.instance.getReferencePriceInfo.call(
    {},
    [ethToken.address, mlnToken.address],
  );
  const [
    ,
    invertedReferencePrice,
  ] = await deployed.CanonicalPriceFeed.instance.getReferencePriceInfo.call({}, [
    mlnToken.address,
    ethToken.address,
  ]);
  const sellQuantity1 = new BigNumber(10 ** 16);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(
      Math.round(referencePrice.div(10 ** 18).times(sellQuantity1)),
    ),
  };
});

const initialTokenAmount = new BigNumber(10 ** 23);
test.serial("investor receives initial EthToken and MlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  txId = await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  txId = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(postDeployerEth, preDeployerEth.minus(runningGasTotal.times(gasPrice)));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken.add(initialTokenAmount));
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken.add(initialTokenAmount));
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(`fund gets quote token from investment`, async t => {
  const boostedOffer = offeredValue.times(1.01); // account for increasing share price after trades occur
  let investorGasTotal = new BigNumber(0);
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, new BigNumber(10 ** 14), ""],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await ethToken.instance.approve.postTransaction(
    { from: investor, gas: config.gas },
    [fund.address, boostedOffer],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  txId = await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas },
    [boostedOffer, wantedShares, ethToken.address],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  const totalSupply = await fund.instance.totalSupply.call();
  const requestId = await fund.instance.getLastRequestId.call();
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas }, [requestId]
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  // set approved token back to zero
  txId = await ethToken.instance.approve.postTransaction(
    { from: investor },
    [fund.address, 0],
  );
  investorGasTotal = investorGasTotal.plus(
    (await api.eth.getTransactionReceipt(txId)).gasUsed,
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call(),
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
  const estimatedEthTokenSpent = wantedShares
    .times(sharePrice)
    .dividedBy(new BigNumber(10 ** 18));

  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken.minus(estimatedEthTokenSpent));
  t.deepEqual(post.investor.ether, pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(estimatedEthTokenSpent));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("investment is allowed in another token", async t => {
  let investorGasTotal = new BigNumber(0);
  const sharePriceInEth = await fund.instance.calcSharePrice.call();
  const [, preUpdateMlnPerEth] = await deployed.CanonicalPriceFeed.instance.getReferencePriceInfo.call(
    {},
    [ethToken.address, mlnToken.address],
  );
  const preUpdateSharePriceInMln = sharePriceInEth.dividedBy(10**18).times(preUpdateMlnPerEth).round();
  const boostedMlnOffer = wantedShares.dividedBy(10**18).times(preUpdateSharePriceInMln).times(1.01).round();
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, boostedMlnOffer, ""],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await mlnToken.instance.approve.postTransaction(
    { from: investor, gas: config.gas },
    [fund.address, boostedMlnOffer],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  txId = await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas },
    [boostedMlnOffer, wantedShares, mlnToken.address],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  const totalSupply = await fund.instance.totalSupply.call();
  const requestId = await fund.instance.getLastRequestId.call();
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas }, [requestId]
  );
  investorGasTotal = investorGasTotal.plus((await api.eth.getTransactionReceipt(txId)).gasUsed);
  const [, postUpdateMlnPerEth] = await deployed.CanonicalPriceFeed.instance.getReferencePriceInfo.call(
    {}, [ethToken.address, mlnToken.address]
  );
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call(),
  );
  // set approved token back to zero
  txId = await mlnToken.instance.approve.postTransaction({from: investor}, [fund.address, 0]);
  investorGasTotal = investorGasTotal.plus((await api.eth.getTransactionReceipt(txId)).gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const feesShareQuantity = unclaimedFees.times(totalSupply).dividedBy(gav);
  const postUpdateSharePriceInEth = await fund.instance.calcValuePerShare.call({}, [
    gav, totalSupply.add(feesShareQuantity)
  ]);
  const postUpdateSharePriceInMln = postUpdateSharePriceInEth.times(postUpdateMlnPerEth).dividedBy(10**18);
  const estimatedMlnTokenSpent = wantedShares
    .dividedBy(10 ** 18)
    .times(postUpdateSharePriceInMln).floor();

  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken.minus(estimatedMlnTokenSpent));
  t.deepEqual(post.investor.ether, pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(estimatedMlnTokenSpent));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});


test.serial("manager makes order, and sellToken is transferred to exchange", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const exchangePreMln = await mlnToken.instance.balanceOf.call({}, [
    deployed.MatchingMarket.address
  ]);
  const exchangePreEthToken = await ethToken.instance.balanceOf.call({}, [
    deployed.MatchingMarket.address
  ]);
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  txId = await fund.instance.callOnExchange.postTransaction(
    {from: manager, gas: config.gas},
    [
      0, makeOrderSignature,
      ['0x0', '0x0', ethToken.address, mlnToken.address, '0x0'],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      '0x0', 0, '0x0', '0x0'
    ]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = await mlnToken.instance.balanceOf.call({}, [
    deployed.MatchingMarket.address
  ]);
  const exchangePostEthToken = await ethToken.instance.balanceOf.call({}, [
    deployed.MatchingMarket.address
  ]);
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(exchangePostMln, exchangePreMln);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken.add(trade1.sellQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether.minus(runningGasTotal.times(gasPrice)));
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.sellQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("third party takes entire order", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await deployed.MatchingMarket.instance.last_offer_id.call();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [deployed.MatchingMarket.address]),
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [deployed.MatchingMarket.address]),
  );
  txId = await mlnToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [deployed.MatchingMarket.address, trade1.buyQuantity.add(100)],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  txId = await deployed.MatchingMarket.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, trade1.sellQuantity],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [deployed.MatchingMarket.address]),
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [deployed.MatchingMarket.address]),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(exchangePostMln, exchangePreMln);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken - trade1.sellQuantity);
  t.deepEqual(post.deployer.ether, pre.deployer.ether.minus(runningGasTotal.times(gasPrice)));
  t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken.minus(trade1.buyQuantity));
  t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken.add(trade1.sellQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.buyQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("allows redemption by standard method", async t => {
  const redemptionAmount = new BigNumber(10 ** 7);
  let investorGasTotal = new BigNumber(0);
  const investorPreShares = await fund.instance.balanceOf.call({}, [investor]);
  const preTotalShares = await fund.instance.totalSupply.call();
  const sharePrice = await fund.instance.calcSharePrice.call();
  const wantedValue = redemptionAmount.times(sharePrice).dividedBy(10 ** 18).floor();
  const pre = await getAllBalances(deployed, accounts, fund);
  txId = await fund.instance.requestRedemption.postTransaction(
    { from: investor }, [redemptionAmount, wantedValue, ethToken.address]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  await updateCanonicalPriceFeed(deployed, {}, 'ETH');
  const requestId = await fund.instance.getLastRequestId.call();
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas }, [requestId]
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  // reduce remaining allowance to zero
  txId = await ethToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice }, [fund.address, 0]
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const remainingApprovedMln = Number(
    await ethToken.instance.allowance.call({}, [investor, fund.address]),
  );
  const investorPostShares = await fund.instance.balanceOf.call({}, [investor]);
  const postTotalShares = await fund.instance.totalSupply.call();
  const post = await getAllBalances(deployed, accounts, fund);
  const [gav, , , unclaimedFees, ,] = Object.values(
    await fund.instance.atLastUnclaimedFeeAllocation.call()
  );
  const expectedFeesShares = parseInt(unclaimedFees.mul(preTotalShares).div(gav).toNumber(), 0);

  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(postTotalShares, preTotalShares.minus(redemptionAmount).plus(expectedFeesShares));
  t.deepEqual(investorPostShares, investorPreShares.minus(redemptionAmount));
  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken.add(wantedValue));
  t.deepEqual(post.investor.ether, pre.investor.ether.minus(investorGasTotal.times(gasPrice)));
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(wantedValue));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

