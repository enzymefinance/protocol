import test from "ava";
import { ZeroEx } from '0x.js';
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import {getSignatureParameters, getTermsSignatureParameters} from "../../utils/lib/signing";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";
import { takeOrderSignature } from "../../utils/lib/data";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let mlnToken;
let fund;
let investor;
let manager;
let pricefeed;
let tokenProxyAddress;
let exchangeFee;
let trade1;
let version;
let deployed;
let order;
let signedOrder;
let opts;

// mock data
const offeredValue = new BigNumber(10 ** 20);
const wantedShares = new BigNumber(10 ** 20);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, ,] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  deployed.EthfinexExchange = await deployContract(
    "exchange/thirdparty/ethfinex/ExchangeEfx",
    opts,
  );
  deployed.EthfinexAdapter = await deployContract(
    "exchange/adapter/EfxExchangeAdapter",
    opts
  );
  await governanceAction(
    opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.EthfinexExchange.options.address,
      deployed.EthfinexAdapter.options.address,
      false,
      [ takeOrderSignature ]
    ]
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex("Test Fund"),
    deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.EthfinexExchange.options.address],
    [],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
  );
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  tokenProxyAddress = await deployed.EthfinexExchange.methods.TOKEN_TRANSFER_PROXY_CONTRACT().call();
  exchangeFee = await deployed.EthfinexExchange.methods.ETHFINEX_FEE().call();

  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(investor).send(
    opts
  );
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);
  const [, referencePrice] = Object.values(await pricefeed.methods.getReferencePriceInfo(mlnToken.options.address, ethToken.options.address).call());
  const sellQuantity1 = new BigNumber(10 ** 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(referencePrice).dividedBy(new BigNumber(10 ** 18)).times(sellQuantity1),
  };
});

const initialTokenAmount = new BigNumber(10 ** 22);
test.serial("investor gets initial ethToken for testing)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods.transfer(investor, initialTokenAmount).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount),
  );

  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(
  "fund receives ETH from investment, and gets ZRX from direct transfer",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods.approve(fund.options.address, offeredValue).send(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas }
    );
    await fund.methods.requestInvestment(offeredValue, wantedShares, ethToken.options.address).send(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice }
    );
    const requestId = await fund.methods.getLastRequestId().call();
    await fund.methods.executeRequest(requestId).send(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice }
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue),
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("third party makes and validates an off-chain order", async t => {
  const makerAddress = deployer.toLowerCase();
  order = {
      maker: makerAddress,
      taker: ZeroEx.NULL_ADDRESS,
      feeRecipient: ZeroEx.NULL_ADDRESS,
      makerTokenAddress: mlnToken.options.address.toLowerCase(),
      takerTokenAddress: ethToken.options.address.toLowerCase(),
      exchangeContractAddress: deployed.EthfinexExchange.options.address.toLowerCase(),
      salt: new BigNumber(555),
      makerFee: new BigNumber(0),
      takerFee: new BigNumber(1000),
      makerTokenAmount: new BigNumber(trade1.sellQuantity),
      takerTokenAmount: new BigNumber(trade1.buyQuantity),
      expirationUnixTimestampSec: new BigNumber(Date.now() + 3600000)
  };
  await mlnToken.methods.approve(tokenProxyAddress, trade1.sellQuantity).send(
    {from: deployer},

  );
  const orderHash = ZeroEx.getOrderHashHex(order);
  const [r, s, v] = await getSignatureParameters(makerAddress, orderHash)
  const ecSignature = { v, r, s };
  signedOrder = {
      ...order,
      ecSignature
  };
  const signatureValid = await ZeroEx.isValidSignature(orderHash, ecSignature, makerAddress);

  t.true(signatureValid);
});

test.serial("manager takes order through 0x adapter", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await fund.methods.callOnExchange(
    0, takeOrderSignature,
    [deployer, ZeroEx.NULL_ADDRESS, mlnToken.options.address, ethToken.options.address, ZeroEx.NULL_ADDRESS],
    [
      trade1.sellQuantity, trade1.buyQuantity, new BigNumber(0), order.takerFee,
      order.expirationUnixTimestampSec, order.salt, trade1.buyQuantity, 0
    ],
    web3.utils.padLeft('0x0', 64), signedOrder.ecSignature.v, signedOrder.ecSignature.r, signedOrder.ecSignature.s
  ).send(
    {from: manager, gas: config.gas}
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.methods.quantityHeldInCustodyOfExchange(ethToken.options.address).call();
  const makerReceiveQuantityAfterFee = trade1.buyQuantity.minus(trade1.buyQuantity.div(exchangeFee));

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.sellQuantity),
  );
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(makerReceiveQuantityAfterFee));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken.plus(makerReceiveQuantityAfterFee));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
