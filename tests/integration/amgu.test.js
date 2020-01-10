import { toWei, BN } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getFundComponents from '~/tests/utils/getFundComponents';

describe('amgu', () => {
  let user, defaultTxOpts, defaultTxOptsWithValue;
  let baseToken, quoteToken;
  let engine, version, priceSource, registry;
  let amguPrice;
  let fundName;

  async function assertAmguTx(tx) {
    const preUserBalance = await web3.eth.getBalance(user);
    const result = await tx.send({ ...defaultTxOpts, value: toWei('1', 'ether') });
    const postUserBalance = await web3.eth.getBalance(user);

    const gasPrice = await web3.eth.getGasPrice();
    const gasUsed = result.gasUsed;
    const estimatedGasUsedWithoutAmgu = result.gasUsed;

    const nativeAssetAddress = await registry.methods.nativeAsset().call();
    const mlnAddress = await version.methods.mlnToken().call();

    const mlnAmount = new BN(amguPrice).mul(new BN(estimatedGasUsedWithoutAmgu));
    const ethToPay = await priceSource.methods.convertQuantity(
      mlnAmount.toString(),
      mlnAddress,
      nativeAssetAddress,
    ).call();

    const txCostInWei = new BN(gasPrice).mul(new BN(gasUsed));
    const estimatedTotalUserCost = new BN(ethToPay).add(new BN(txCostInWei))
    const realUserCost = new BN(preUserBalance).sub(new BN(postUserBalance));

    expect(txCostInWei).bigNumberLt(realUserCost);
    expect(estimatedTotalUserCost).bigNumberGt(realUserCost);

    return result;
  }

  beforeEach(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    defaultTxOptsWithValue = { ...defaultTxOpts, value: toWei('1', 'ether') };

    const deployed = await partialRedeploy([
      CONTRACT_NAMES.VERSION,
      CONTRACT_NAMES.ENGINE
    ]);
    const contracts = deployed.contracts;

    engine = contracts.Engine;
    version = contracts.Version;
    registry = contracts.Registry;
    priceSource = contracts.TestingPriceFeed;

    quoteToken = contracts.WETH;
    baseToken = contracts.MLN;

    amguPrice = '1000000000';
    fundName = `test-fund-${Date.now()}`;
  });

  it('Set amgu and check its usage', async () => {
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice.toString()).toBe(amguPrice.toString());

    const newPrice = toWei('2', 'ether');
    await priceSource.methods
      .update([baseToken.options.address], [newPrice])
      .send(defaultTxOpts)

    const price = await priceSource.methods
      .getPrices([baseToken.options.address])
      .call();

    expect(price[0][0].toString()).toBe(newPrice.toString());

    await version.methods
      .beginSetup(
        fundName,
        [],
        [],
        [],
        [],
        [],
        quoteToken.options.address,
        [baseToken.options.address, quoteToken.options.address]
      ).send(defaultTxOpts);

    const createAccountingTx = version.methods.createAccounting();
    await assertAmguTx(createAccountingTx);
  });

  afterEach(async () => {
    await engine.methods
      .setAmguPrice('0')
      .send(defaultTxOpts)
    const resetAmguPrice = await engine.methods.getAmguPrice().call();
    expect(resetAmguPrice).toBe('0');

    await registry.methods.setIncentive(toWei('10', 'finney')).send(defaultTxOpts);
    const resetIncentive = await registry.methods.incentive().call();
    expect(resetIncentive).toBe(toWei('10', 'finney'));
  });

  it('set amgu with incentive attatched and check its usage', async () => {
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice.toString()).toBe(amguPrice.toString());

    const newPrice = toWei('2', 'ether');
    await priceSource.methods
      .update([baseToken.options.address], [newPrice])
      .send(defaultTxOpts)

    const price = await priceSource.methods
      .getPrices([baseToken.options.address])
      .call();

    expect(price[0][0].toString()).toBe(newPrice.toString());

    await version.methods
      .beginSetup(
        fundName,
        [],
        [],
        [],
        [],
        [],
        quoteToken.options.address,
        [baseToken.options.address, quoteToken.options.address]
      ).send(defaultTxOpts);

    const createAccountingTx = version.methods.createAccounting();
    await assertAmguTx(createAccountingTx);

    const createFeeManagerTx = version.methods.createFeeManager();
    await assertAmguTx(createFeeManagerTx);

    const createParticipationTx = version.methods.createParticipation();
    await assertAmguTx(createParticipationTx);

    const createPolicyManagerTx = version.methods.createPolicyManager();
    await assertAmguTx(createPolicyManagerTx);

    const createSharesTx = version.methods.createShares();
    await assertAmguTx(createSharesTx);

    const createTradingTx = version.methods.createTrading();
    await assertAmguTx(createTradingTx);

    const createVaultTx = version.methods.createVault();
    await assertAmguTx(createVaultTx);

    const res = await version.methods.completeSetup().send(defaultTxOptsWithValue);

    const hubAddress = res.events.NewFund.returnValues.hub;
    const fund = await getFundComponents(hubAddress);

    const requestedShares = toWei('100', 'ether');
    const investmentAmount = toWei('100', 'ether');

    await quoteToken.methods
      .approve(fund.participation.options.address, investmentAmount)
      .send(defaultTxOpts);

    await registry.methods.setIncentive(toWei('100', 'ether')).send(defaultTxOpts);
    const incentiveAmount = await registry.methods.incentive().call();
    expect(incentiveAmount).toBe(toWei('100', 'ether'));

    const amguTx = fund.participation.methods
      .requestInvestment(
        requestedShares,
        investmentAmount,
        quoteToken.options.address,
      )

    const preUserBalance = await web3.eth.getBalance(user);
    const result = await amguTx.send({ ...defaultTxOpts, value: toWei('101', 'ether') });
    const postUserBalance = await web3.eth.getBalance(user);

    const gasPrice = await web3.eth.getGasPrice();
    const gasUsed = result.gasUsed;
    const estimatedGasUsedWithoutAmgu = result.gasUsed;

    const nativeAssetAddress = await registry.methods.nativeAsset().call();
    const mlnAddress = await version.methods.mlnToken().call();

    const mlnAmount = new BN(amguPrice).mul(new BN(estimatedGasUsedWithoutAmgu));
    const ethToPay = await priceSource.methods.convertQuantity(
      mlnAmount.toString(),
      mlnAddress,
      nativeAssetAddress,
    ).call();

    const txCostInWei = new BN(gasPrice).mul(new BN(gasUsed));
    const estimatedTotalUserCost = new BN(ethToPay).add(new BN(txCostInWei)).add(new BN(incentiveAmount));
    const realUserCost = new BN(preUserBalance).sub(new BN(postUserBalance));

    expect(txCostInWei.add(new BN(incentiveAmount))).bigNumberLt(realUserCost);
    expect(estimatedTotalUserCost).bigNumberGt(realUserCost);
  });
});
