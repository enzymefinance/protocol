import { BN, toWei } from 'web3-utils';
import { getFunctionSignature } from '../utils/new/metadata';
import { CONTRACT_NAMES } from '../utils/new/constants';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { stringToBytes } from '../utils/new/formatting';
import { BNExpMul } from '../utils/new/BNmath';
const {fetchContract} = require('../../../deploy/utils/deploy-contract');
const web3 = require('../../../deploy/utils/get-web3');
const deploySystem = require('../../../deploy/scripts/deploy-system');

describe('fund-quote-asset', () => {
  let environment, accounts;
  let deployer, manager, investor;
  let defaultTxOpts, investorTxOpts, managerTxOpts;
  let fundDenominationAsset;
  let trade1;
  let contracts, deployOut;
  let dgx, mln, weth, matchingMarket, version, priceSource;
  let hub, accounting, participation, shares, trading, vault;
  let makeOrderSignature;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    
    contracts = deployed.contracts;
    deployOut = deployed.deployOut;
    version = contracts.Version;
    dgx = contracts.DGX;
    mln = contracts.MLN;
    weth = contracts.WETH;
    matchingMarket = contracts.MatchingMarket;
    priceSource = contracts.TestingPriceFeed;
    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const mlnDgxAlreadyWhitelisted = matchingMarket.methods.isTokenPairWhitelisted(mln.options.address, dgx.options.address).call();
    if (!mlnDgxAlreadyWhitelisted) {
      await matchingMarket.methods.addTokenPairWhitelist(mln.options.address, dgx.options.address).send(defaultTxOpts);
    }

    await version.methods
      .beginSetup(
        stringToBytes('Test fund', 32),
        [],
        [],
        [],
        [matchingMarket.options.address.toString()],
        [deployOut.melon.addr.MatchingMarketAdapter],
        dgx.options.address.toString(),
        [
          mln.options.address.toString(),
          weth.options.address.toString(),
          dgx.options.address.toString(),
        ],
      )
      .send(managerTxOpts);
    await version.methods.createAccounting().send(managerTxOpts);
    await version.methods.createFeeManager().send(managerTxOpts);
    await version.methods.createParticipation().send(managerTxOpts);
    await version.methods.createPolicyManager().send(managerTxOpts);
    await version.methods.createShares().send(managerTxOpts);
    await version.methods.createTrading().send(managerTxOpts);
    await version.methods.createVault().send(managerTxOpts);
    const res = await version.methods.completeSetup().send(managerTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;
    hub = fetchContract('Hub', hubAddress);
    const accountingAddress = await hub.methods.accounting.call();
    accounting = fetchContract('Accounting', accountingAddress);
    const sharesAddress = await hub.methods.shares.call();
    shares = fetchContract('Shares', sharesAddress);
    const vaultAddress = await hub.methods.vault.call();
    vault = fetchContract('Vault', vaultAddress);
    const participationAddress = await hub.methods.participation.call();
    participation = fetchContract('Participation', participationAddress);
    const tradingAddress = await hub.methods.trading.call();
    trading = fetchContract('Trading', tradingAddress);
  });

  test('fund denomination asset is dgx', async () => {
    fundDenominationAsset = await accounting.methods
      .DENOMINATION_ASSET()
      .call();
    expect(fundDenominationAsset).toBe(dgx.options.address);
  });

  test('Transfer ethToken and mlnToken to the investor', async () => {
    const initialTokenAmount = toWei('1000', 'ether');

    const preMlnInvestor = await mln.methods.balanceOf(investor).call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    await mln.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);
    await weth.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);
    const postMlnInvestor = await mln.methods.balanceOf(investor).call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(
      new BN(postMlnInvestor.toString()).eq(
        new BN(preMlnInvestor.toString()).add(new BN(initialTokenAmount.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethInvestor.toString()).add(new BN(initialTokenAmount.toString())),
      ),
    ).toBe(true);
  });

  test('fund gets non fund denomination asset from investment', async () => {
    const offeredValue = toWei('100', 'ether');
    const wantedShares = toWei('100', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInWeth = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, weth.options.address)
      .call())[0];

    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares.toString()),
      new BN(dgxPriceInWeth.toString()),
    );

    const actualCostOfShares = new BN(
      (await accounting.methods
        .getShareCostInAsset(wantedShares, weth.options.address)
        .call()).toString(),
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

    // TODO: use less fake prices
    const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
    await priceSource.methods.update(Object.values(deployOut.tokens.addr), fakePrices);

    const preWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await weth.methods
      .approve(participation.options.address, wantedShares)
      .send(investorTxOpts);

    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const wethPriceInDgx = (await priceSource.methods
      .getReferencePriceInfo(weth.options.address, fundDenominationAsset)
      .call())[0];

    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(wantedShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethInvestor.toString()).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund.toString()).eq(new BN(preWethFund.toString()).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav.toString()).eq(
        new BN(preWethFund.toString()).add(
          BNExpMul(expectedCostOfShares, new BN(wethPriceInDgx.toString())),
        ),
      ),
    ).toBe(true);
  });

  test('investor redeems his shares', async () => {
    const investorShares = await shares.methods.balanceOf(investor).call();

    const preWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await participation.methods.redeem().send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).sub(new BN(investorShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethInvestor.toString()).add(new BN(preWethFund.toString())),
      ),
    ).toBe(true);
    expect(new BN(postWethFund.toString()).eq(new BN(0))).toBe(true);
    expect(new BN(postFundGav.toString()).eq(new BN(0))).toBe(true);
  });

  test('fund gets non pricefeed quote asset from investment', async () => {
    const offeredValue = toWei('1000', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const dgxPriceInMln = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, mln.options.address)
      .call())[0];
    const expectedCostOfShares = BNExpMul(
      new BN(wantedShares.toString()),
      new BN(dgxPriceInMln.toString()),
    );
    const actualCostOfShares = new BN(
      (await accounting.methods
        .getShareCostInAsset(wantedShares, mln.options.address)
        .call()).toString()
    );
    expect(expectedCostOfShares.eq(actualCostOfShares)).toBe(true);

    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnInvestor = await mln.methods.balanceOf(investor).call();
    const preFundGav = await accounting.methods.calcGav().call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await mln.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(wantedShares, offeredValue, mln.options.address)
      .send({ ...investorTxOpts, value: amguAmount });
    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnInvestor = await mln.methods.balanceOf(investor).call();
    const postFundGav = await accounting.methods.calcGav().call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const mlnPriceInDgx = (await priceSource.methods
      .getReferencePriceInfo(mln.options.address, fundDenominationAsset)
      .call())[0];

    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(wantedShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnInvestor.toString()).eq(
        new BN(preMlnInvestor.toString()).sub(expectedCostOfShares),
      ),
    ).toBe(true);
    expect(
      new BN(postMlnFund.toString()).eq(new BN(preMlnFund.toString()).add(expectedCostOfShares)),
    ).toBe(true);
    expect(
      new BN(postFundGav.toString()).eq(
        new BN(preFundGav.toString()).add(
          BNExpMul(expectedCostOfShares, new BN(mlnPriceInDgx.toString())),
        ),
      ),
    ).toBe(true);
  });

  test('Fund make order with a non-18 decimal asset', async () => {
    const wantedShares = toWei('1', 'ether');
    trade1 = {
      sellQuantity: toWei('0.1', 'gwei'),
    };

    await dgx.methods
      .transfer(vault.options.address, trade1.sellQuantity)
      .send(defaultTxOpts);

    const dgxPriceInMln = (await priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, mln.options.address)
      .call())[0];
    trade1.buyQuantity = BNExpMul(
      new BN(trade1.sellQuantity.toString()),
      new BN(dgxPriceInMln.toString()),
      9,
    ).toString();

    const preDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const preFundCalcs = await accounting.methods.performCalculations().call();

    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          randomHexOfSize(20),
          randomHexOfSize(20),
          dgx.options.address,
          mln.options.address,
          randomHexOfSize(20),
          randomHexOfSize(20),
        ],
        [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
        randomHexOfSize(32),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postFundCalcs = await accounting.methods.performCalculations().call();

    expect(preMlnExchange).toEqual(postMlnExchange);
    expect(postMlnFund).toEqual(preMlnFund);
    expect(new BN(postDgxExchange.toString()))
      .toEqualBN(new BN(preDgxExchange.toString()).add(new BN(trade1.sellQuantity.toString())));
    expect(new BN(postDgxFund.toString()))
      .toEqualBN(new BN(preDgxFund.toString()).sub(new BN(trade1.sellQuantity.toString())));
    expect(postFundCalcs.gav.toString()).toBe(preFundCalcs.gav.toString());
    expect(postFundCalcs.sharePrice.toString()).toBe(preFundCalcs.sharePrice.toString());
    expect(postMlnDeployer.toString()).toBe(preMlnDeployer.toString());
  });

  test('Third party takes entire order', async () => {
    const orderId = await matchingMarket.methods.last_offer_id().call();

    const preDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const preDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const preMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    await mln.methods
      .approve(matchingMarket.options.address, trade1.buyQuantity)
      .send(defaultTxOpts);
    await matchingMarket.methods
      .buy(orderId, trade1.sellQuantity)
      .send(defaultTxOpts);
    await trading.methods
      .returnBatchToVault([mln.options.address, weth.options.address])
      .send(managerTxOpts);

    const postDgxDeployer = await dgx.methods.balanceOf(deployer).call();
    const postDgxExchange = await dgx.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postDgxFund = await dgx.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnDeployer = await mln.methods.balanceOf(deployer).call();
    const postMlnExchange = await mln.methods
      .balanceOf(matchingMarket.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();

    expect(preMlnExchange).toEqual(postMlnExchange);
    expect(new BN(postDgxExchange.toString()))
      .toEqualBN(new BN(preDgxExchange.toString()).sub(new BN(trade1.sellQuantity.toString())));
    expect(postDgxFund.toString()).toBe(preDgxFund.toString());
    expect(new BN(postMlnFund.toString()))
      .toEqualBN(new BN(preMlnFund.toString()).add(new BN(trade1.buyQuantity.toString())));
    expect(new BN(postDgxDeployer.toString()))
      .toEqualBN(new BN(preDgxDeployer.toString()).add(new BN(trade1.sellQuantity.toString())));
    expect(new BN(postMlnDeployer.toString()))
      .toEqualBN(new BN(preMlnDeployer.toString()).sub(new BN(trade1.buyQuantity.toString())));
  });
});
