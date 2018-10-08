import test from "ava";
import {
  Web3ProviderEngine,
  assetDataUtils,
  Order,
  orderHashUtils,
  signatureUtils,
  SignerType
} from "0x.js";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import {
  getSignatureParameters,
  getTermsSignatureParameters
} from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";
import { takeOrderSignatureString, takeOrderSignature } from "../../utils/lib/data";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let mlnToken;
let zrxToken;
let zeroExExchange;
let erc20ProxyAddress;
let fund;
let investor;
let manager;
let pricefeed;
let trade1;
let version;
let deployed;
let order;
let orderSignature;
let opts;

// mock data
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const offeredValue = new BigNumber(10 ** 19);
const wantedShares = new BigNumber(10 ** 19);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, ,] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  zrxToken = await retrieveContract(
    "assets/Asset",
    "0x871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c"
  );
  zeroExExchange = "0x48bacb9266a570d521063ef5dd96e61686dbe788";
  erc20ProxyAddress = "0x1dc4c1cefef38a777b15aa20260a54e584b16c48";
  deployed.ZeroExV1Adapter = await deployContract(
    "exchange/adapter/ZeroExV1Adapter",
    opts
  );
  await governanceAction(
    opts,
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      zeroExExchange,
      deployed.ZeroExV1Adapter.options.address,
      false,
      [takeOrderSignature]
    ]
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods
    .setupFund(
      web3.utils.toHex("Test Fund"),
      deployed.EthToken.options.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.options.address,
      deployed.RMMakeOrders.options.address,
      [zeroExExchange],
      [],
      v,
      r,
      s
    )
    .send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods
    .changeCompetitionAddress(investor)
    .send(opts);
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);
  const [, referencePrice] = Object.values(
    await pricefeed.methods
      .getReferencePriceInfo(mlnToken.options.address, ethToken.options.address)
      .call()
  );
  const sellQuantity1 = new BigNumber(10 ** 18);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(referencePrice)
      .dividedBy(new BigNumber(10 ** 18))
      .times(sellQuantity1)
  };
});

const initialTokenAmount = new BigNumber(10 ** 19);
test.serial("investor gets initial ethToken for testing)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods
    .transfer(investor, initialTokenAmount)
    .send({ from: deployer, gasPrice: config.gasPrice });
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount)
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
    await zrxToken.methods
      .transfer(investor, initialTokenAmount)
      .send({ from: deployer, gasPrice: config.gasPrice });
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue)
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

test.serial("third party makes and validates an off-chain order", async t => {
  const makerAddress = deployer.toLowerCase();
  order = {
    exchangeAddress: zeroExExchange.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(Date.now() + 3600000),
    salt: new BigNumber(555),
    makerAssetAmount: new BigNumber(trade1.sellQuantity),
    takerAssetAmount: new BigNumber(trade1.buyQuantity),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      mlnToken.options.address.toLowerCase()
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      ethToken.options.address.toLowerCase()
    ),
    makerFee: new BigNumber(0),
    takerFee: new BigNumber(0)
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  orderSignature = await signatureUtils.ecSignOrderHashAsync(
    web3.currentProvider,
    orderHashHex,
    deployer,
    SignerType.Default
  );

  await mlnToken.methods
    .approve(erc20ProxyAddress, trade1.sellQuantity)
    .send({ from: deployer });

  const signatureValid = await signatureUtils.isValidSignatureAsync(
    web3.currentProvider,
    orderHashHex,
    orderSignature,
    makerAddress
  );

  t.true(signatureValid);
});

test.serial("manager takes order through 0x adapter", async t => {
  console.log(takeOrderSignatureString);
  const pre = await getAllBalances(deployed, accounts, fund);
  const tx = await fund.methods
    .callOnExchange(
      0,
      takeOrderSignatureString,
      [
        deployer,
        NULL_ADDRESS,
        NULL_ADDRESS,
        mlnToken.options.address,
        ethToken.options.address,
        manager
      ],
      [
        order.makerAssetAmount,
        order.takerAssetAmount,
        order.makerFee,
        order.takerFee,
        order.expirationTimeSeconds,
        order.salt,
        trade1.buyQuantity,
        0
      ],
      web3.utils.padLeft("0x0", 64),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature
    )
    .send({ from: manager, gas: config.gas });
  console.log(tx);
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.methods
    .quantityHeldInCustodyOfExchange(ethToken.options.address)
    .call();

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.sellQuantity)
  );
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.buyQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(
    post.deployer.EthToken,
    pre.deployer.EthToken.plus(trade1.buyQuantity)
  );
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
