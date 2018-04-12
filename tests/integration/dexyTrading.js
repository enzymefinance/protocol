import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import {getSignatureParameters, getTermsSignatureParameters} from "../../utils/lib/signing";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let investor;
let manager;
let mlnToken;
let pricefeed;
let trade1;
let trade2;
let trade3;
let version;
let deployed;

// helper functions
async function getOrderHash(order, orderCreator, exchangeAddress) {
  const hashScheme = await api.util.sha3([
    "address Token Get", "uint Amount Get", "address Token Give", "uint Amount Give",
    "uint Expires", "uint Nonce", "address User", "address Exchange"
  ].join(""));
  // const innerHash = await api.util.sha3([
  //   order.getAsset, order.getQuantity, order.giveAsset, order.giveQuantity,
  //   order.expires, order.nonce, orderCreator, exchangeAddress
  // ].join(""));
  // const orderHash = await api.util.sha3([hashScheme, innerHash].join(""));

  const innerHash =  await api.util.sha3([
    order.getAsset.substr(2),
    Number(order.getQuantity).toString(16).padStart(64, '0'),
    order.giveAsset.substr(2),
    Number(order.giveQuantity).toString(16).padStart(64, '0'),
    Number(order.expires).toString(16).padStart(64, '0'),
    Number(order.nonce).toString(16).padStart(64, '0'),
    orderCreator.substr(2),
    exchangeAddress.substr(2)
  ].join(""));
  const orderHash = await api.util.sha3([
    hashScheme.substr(2),
    innerHash.substr(2)
  ].join(""));

  // const inter2 =  await api.util.sha3([
  //   order.getAsset, order.getQuantity, order.giveAsset.toString(), order.giveQuantity.toString(),
  //   order.expires, order.nonce, orderCreator, exchangeAddress
  // ].join(""));
  // const poss2 = await api.util.sha3([hashScheme, inter2].join(""));
  // console.log(`POSS 2: ${poss2}`)

  return orderHash;
}

async function signOrder(signer, order) {
  const orderHash = await getOrderHash(order);
  const [r, s, v] = await getSignatureParameters(signer, orderHash);
  const mode = Buffer(1);
  const signature = "0x" + Buffer.concat([mode, v, r, s]).toString('hex');
}

// declare function signatures
const makeOrderSignature = api.util.abiSignature('makeOrder', [
  'address', 'address[5]', 'uint256[7]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const takeOrderSignature = api.util.abiSignature('takeOrder', [
  'address', 'address[5]', 'uint256[7]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);
const cancelOrderSignature = api.util.abiSignature('cancelOrder', [
  'address', 'address[5]', 'uint256[7]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
]).slice(0,10);

// mock data
const offeredValue = new BigNumber(10 ** 20);
const wantedShares = new BigNumber(10 ** 20);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, ,] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  deployed.DexyVault = await deployContract(
    "exchange/thirdparty/dexy/Vault",
    {from: deployer}
  );
  deployed.DexyExchange = await deployContract(
    "exchange/thirdparty/dexy/Exchange",
    { from: deployer },
    [0, deployer, deployed.DexyVault.address]
  );
  deployed.DexyAdapter = await deployContract(
    "exchange/adapter/DexyAdapter",
    { from: deployer }
  );
  await deployed.DexyVault.instance.setExchange.postTransaction(
    {from: deployer}, [deployed.DexyExchange.address]
  );
  await governanceAction(
    {from: deployer}, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.DexyExchange.address,
      deployed.DexyAdapter.address,
      false,
      [ makeOrderSignature, takeOrderSignature, cancelOrderSignature ]
    ]
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test Fund",
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.DexyExchange.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);

  const [, referencePrice] = await pricefeed.instance.getReferencePriceInfo.call(
    {}, [mlnToken.address, ethToken.address]
  );
  const sellQuantity1 = new BigNumber(10 ** 19);
  trade1 = {
    giveAsset: ethToken.address,
    getAsset: mlnToken.address,
    giveQuantity: sellQuantity1,
    getQuantity: sellQuantity1,
    // getQuantity: referencePrice.dividedBy(new BigNumber(10 ** 18)).times(sellQuantity1),
    expires: Math.floor((Date.now() / 1000) + 50000),
    nonce: 10
  };
  trade2 = {
    giveAsset: ethToken.address,
    getAsset: mlnToken.address,
    giveQuantity: sellQuantity1,
    getQuantity: referencePrice.dividedBy(new BigNumber(10 ** 18)).times(sellQuantity1),
    expires: Math.floor((Date.now() / 1000) + 5000),
    nonce: 11
  };
  trade3 = {
    giveAsset: mlnToken.address,
    getAsset: ethToken.address,
    giveQuantity: sellQuantity1,
    getQuantity: referencePrice.dividedBy(new BigNumber(10 ** 18)).times(sellQuantity1),
    expires: Math.floor((Date.now() / 1000) + 5000),
    nonce: 12
  };
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);
});

const initialTokenAmount = new BigNumber(10 ** 22);
test.serial("investor receives initial tokens for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""]
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.MlnToken,
    new BigNumber(pre.investor.MlnToken).add(initialTokenAmount)
  );
  t.deepEqual( post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("fund receives MLN from an investment", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, offeredValue],
  );
  await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredValue, wantedShares, mlnToken.address],
  );
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(
    post.investor.MlnToken,
    pre.investor.MlnToken.minus(offeredValue),
  );
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(offeredValue));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("third party makes an on-chain order", async t => {
  await deployed.DexyVault.instance.approve.postTransaction(
    {from: deployer}, [deployed.DexyExchange.address]
  );
  await ethToken.instance.approve.postTransaction(
    {from: deployer}, [deployed.DexyVault.address, trade1.giveQuantity]
  );
  await deployed.DexyVault.instance.deposit.postTransaction(
    {from: deployer}, [ethToken.address, trade1.giveQuantity]
  );
  await deployed.DexyExchange.instance.order.postTransaction(
    {from: deployer},
    [
      [trade1.giveAsset, trade1.getAsset],
      [trade1.giveQuantity, trade1.getQuantity, trade1.expires, trade1.nonce]
    ]
  );
  const orderHash = await getOrderHash(trade1, deployer, deployed.DexyExchange.address);
  const isOrdered = await deployed.DexyExchange.instance.isOrdered.call({}, [deployer, orderHash]);

  t.true(isOrdered);
});

test.serial("manager takes on-chain order through dexy adapter", async t => {
});

test.serial.skip("third party makes an off-chain order", async t => {
  await ethToken.instance.approve.postTransaction({from: deployer}, [trade1.giveQuantity]);
  await deployed.vault.instance.deposit.postTransaction(
    {from: deployer}, [ethToken.address, trade1.giveQuantity]
  );
  const orderHash = await getOrderHash(trade1, deployer, deployed.DexyExchange.address);
  const isOrdered = await deployed.DexyExchange.instance.isOrdered.call(deployer, orderHash);

  t.true(isOrdered);
});

test.serial.skip("manager takes off-chain order through dexy adapter", async t => {
});

test.serial.skip("manager makes order through dexy adapter", async t => {
});

test.serial.skip("third party takes an order made by exchange", async t => {
});

test.serial.skip("manager makes and cancels order through dexy adapter", async t => {
});
