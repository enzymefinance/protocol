import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateKyberPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import { makeOrderSignature, cancelOrderSignature } from "../../utils/lib/data";
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
let exchangeOwner;
let trade1;
let version;
let deployed;
let opts;

// mock data
const offeredValue = new BigNumber(10 ** 10);
const wantedShares = new BigNumber(10 ** 10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, , exchangeOwner] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  deployed.CentralizedExchangeBridge = await deployContract(
    "exchange/thirdparty/CentralizedExchangeBridge", opts
  );
  await governanceAction(
    { from: deployer },
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      deployed.CentralizedExchangeBridge.options.address,
      deployed.CentralizedAdapter.options.address,
      true,
      [makeOrderSignature, cancelOrderSignature],
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
    [deployed.CentralizedExchangeBridge.options.address],
    [],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition.options.address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(investor).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
});

test.beforeEach(async () => {
  await updateKyberPriceFeed(deployed);

  const [
    ,
    referencePrice,
  ] = Object.values(await pricefeed.methods.getReferencePriceInfo(
    ethToken.options.address,
    mlnToken.options.address,
  ).call());
  const sellQuantity1 = new BigNumber(10 * 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(new BigNumber(referencePrice) / 10 ** 18 * sellQuantity1),
  };
});

test.serial(
  "transfer ownership of exchange from deployer to new owner",
  async t => {
    const oldOwner = await deployed.CentralizedExchangeBridge.methods.owner().call();
    await deployed.CentralizedExchangeBridge.methods.changeOwner(exchangeOwner).send(
      { from: deployer, gasPrice: config.gasPrice }
    );
    const newOwner = await deployed.CentralizedExchangeBridge.methods.owner().call();
    t.is(oldOwner, deployer);
    t.is(newOwner, exchangeOwner);
  },
);

const initialTokenAmount = new BigNumber(10 ** 20);
test.serial("investor receives initial ethToken for testing", async t => {
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
  "fund receives ETH from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods.approve(fund.options.address, offeredValue).send(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas }
    );
    await fund.methods.requestInvestment(offeredValue, wantedShares, ethToken.options.address).send(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice }
    );
    await updateKyberPriceFeed(deployed);
    await updateKyberPriceFeed(deployed);
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

test.serial(
  "Manager makes an order through centralized exchange adapter",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await updateKyberPriceFeed(deployed);
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
    const heldInExchange = await fund.methods.quantityHeldInCustodyOfExchange(ethToken.options.address).call();

    t.deepEqual(Number(heldInExchange), Number(trade1.sellQuantity));
    t.deepEqual(
      post.exchangeOwner.EthToken,
      pre.exchangeOwner.EthToken.add(trade1.sellQuantity),
    );
    t.deepEqual(post.exchangeOwner.MlnToken, pre.exchangeOwner.MlnToken);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.sellQuantity));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Manager settles an order on the exchange interface", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await deployed.CentralizedExchangeBridge.methods.getLastOrderId().call();
  await mlnToken.methods.approve(deployed.CentralizedExchangeBridge.options.address, trade1.buyQuantity).send(
    { from: deployer, gasPrice: config.gasPrice, gas: config.gas }
  );
  await deployed.CentralizedExchangeBridge.methods.settleOrder(orderId, trade1.buyQuantity).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.methods.quantityHeldInCustodyOfExchange(ethToken.options.address).call();

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.buyQuantity),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.buyQuantity));
  t.deepEqual(post.exchangeOwner.MlnToken, pre.exchangeOwner.MlnToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("Manager cancels an order from the fund", async t => {
  await updateKyberPriceFeed(deployed);
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
    [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.methods.transfer(manager, trade1.sellQuantity).send(
    { from: exchangeOwner, gasPrice: config.gasPrice, gas: config.gas }
  );
  await mlnToken.methods.approve(fund.options.address, trade1.sellQuantity).send(
    { from: manager, gasPrice: config.gasPrice, gas: config.gas }
  );
  const orderId = await deployed.CentralizedExchangeBridge.methods.getLastOrderId().call();
  await fund.methods.callOnExchange(
    0,
    cancelOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, "0x0", "0x0"],
    [0, 0, 0, 0, 0, 0, 0, 0],
    `0x${Number(orderId)
      .toString(16)
      .padStart(64, "0")}`,
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  // TODO: check that the order is cancelled (need order ID, which requires 2D mapping access from parity.js)
  // const orderId = await fund.methods.exchangeIdsToOpenMakeOrderIds(0, mlnToken.options.address).call();
  // const orderOpen = await exchanges[0].methods.isActive(orderId).call();
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.methods.quantityHeldInCustodyOfExchange(mlnToken.options.address).call();

  t.is(Number(heldInExchange), 0);
  // t.false(orderOpen);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(
    post.exchangeOwner.MlnToken,
    pre.exchangeOwner.MlnToken.minus(trade1.sellQuantity),
  );
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
