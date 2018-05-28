import test from "ava";
import { ZeroEx } from '0x.js';
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
let mlnToken;
let zrxToken;
let fund;
let investor;
let manager;
let pricefeed;
let trade1;
let version;
let deployed;
let order;
let signedOrder;

// declare function signatures
const takeOrderSignature = api.util.abiSignature('takeOrder', [
  'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
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
  zrxToken = await deployContract("assets/PreminedAsset", {from: deployer});
  deployed.ZeroExTokenTransferProxy = await deployContract(
    "exchange/thirdparty/0x/TokenTransferProxy",
    {from: deployer}
  );
  deployed.ZeroExExchange = await deployContract(
    "exchange/thirdparty/0x/Exchange",
    { from: deployer },
    [ zrxToken.address, deployed.ZeroExTokenTransferProxy.address ]
  );
  deployed.ZeroExV1Adapter = await deployContract(
    "exchange/adapter/ZeroExV1Adapter",
    { from: deployer }
  );
  await deployed.ZeroExTokenTransferProxy.instance.addAuthorizedAddress.postTransaction(
    { from: deployer }, [ deployed.ZeroExExchange.address ]
  );
  await governanceAction(
    {from: deployer}, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    [
      deployed.ZeroExExchange.address,
      deployed.ZeroExV1Adapter.address,
      false,
      [ takeOrderSignature ]
    ]
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test Fund",
      deployed.EthToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.ZeroExExchange.address],
      [],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [investor],
  );
});

test.beforeEach(async () => {
  await updateCanonicalPriceFeed(deployed);

  const [, referencePrice] = await pricefeed.instance.getReferencePriceInfo.call(
    {},
    [mlnToken.address, ethToken.address],
  );
  const sellQuantity1 = new BigNumber(10 ** 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: referencePrice.dividedBy(new BigNumber(10 ** 18)).times(sellQuantity1),
  };
});

const initialTokenAmount = new BigNumber(10 ** 22);
test.serial("investor gets initial ethToken for testing)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
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
    await ethToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas },
      [fund.address, offeredValue],
    );
    await fund.instance.requestInvestment.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [offeredValue, wantedShares, ethToken.address],
    );
    await updateCanonicalPriceFeed(deployed);
    await updateCanonicalPriceFeed(deployed);
    const requestId = await fund.instance.getLastRequestId.call({}, []);
    await fund.instance.executeRequest.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [requestId],
    );
    await zrxToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [investor, initialTokenAmount, ""],
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
      makerTokenAddress: mlnToken.address.toLowerCase(),
      takerTokenAddress: ethToken.address.toLowerCase(),
      exchangeContractAddress: deployed.ZeroExExchange.address.toLowerCase(),
      salt: new BigNumber(555),
      makerFee: new BigNumber(0),
      takerFee: new BigNumber(1000),
      makerTokenAmount: new BigNumber(trade1.sellQuantity),
      takerTokenAmount: new BigNumber(trade1.buyQuantity),
      expirationUnixTimestampSec: new BigNumber(Date.now() + 3600000)
  };
  await mlnToken.instance.approve.postTransaction(
    {from: deployer},
    [deployed.ZeroExTokenTransferProxy.address, trade1.sellQuantity]
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
  const txId = await fund.instance.callOnExchange.postTransaction(
    {from: manager, gas: config.gas},
    [
      0, takeOrderSignature,
      [deployer, ZeroEx.NULL_ADDRESS, mlnToken.address, ethToken.address, ZeroEx.NULL_ADDRESS],
      [
        trade1.sellQuantity, trade1.buyQuantity, new BigNumber(0), order.takerFee,
        order.expirationUnixTimestampSec, order.salt, trade1.buyQuantity, 0
      ],
      '0x0', signedOrder.ecSignature.v, signedOrder.ecSignature.r, signedOrder.ecSignature.s
    ]
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [ethToken.address],
  );

  t.is(Number(heldInExchange), 0);
  t.deepEqual(
    post.deployer.MlnToken,
    pre.deployer.MlnToken.minus(trade1.sellQuantity),
  );
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.minus(trade1.buyQuantity));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken.plus(trade1.buyQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
