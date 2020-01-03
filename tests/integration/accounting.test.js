import { toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getFundComponents from '~/tests/utils/getFundComponents';
import { increaseTime } from '~/tests/utils/rpc';

describe('accounting', () => {
  let user, defaultTxOpts;
  let accounting, vault, participation, testingPriceFeed, weth, mln;
  const exaUnit = toWei('1', 'ether');

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;
    const version = contracts[CONTRACT_NAMES.VERSION];
    testingPriceFeed = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];
    weth = contracts.WETH;
    mln = contracts.MLN;

    await version.methods
      .beginSetup(
        'Fakename',
        [],
        [],
        [],
        [],
        [],
        weth.options.address,
        [weth.options.address, mln.options.address],
      ).send(defaultTxOpts);
    await version.methods.createAccounting().send(defaultTxOpts);
    await version.methods.createFeeManager().send(defaultTxOpts);
    await version.methods.createParticipation().send(defaultTxOpts);
    await version.methods.createPolicyManager().send(defaultTxOpts);
    await version.methods.createShares().send(defaultTxOpts);
    await version.methods.createTrading().send(defaultTxOpts);
    await version.methods.createVault().send(defaultTxOpts);
    const res = await version.methods.completeSetup().send(defaultTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;
    const routes = await getFundComponents(hubAddress);

    accounting = routes.accounting;
    vault = routes.vault;
    participation = routes.participation;

    await testingPriceFeed.methods
      .update([weth.options.address, mln.options.address],
      [`${exaUnit}`, `${exaUnit}`]
    ).send(defaultTxOpts);
  });

  it('component has proper values after initialization', async () => {
    await expect(
      accounting.methods.getOwnedAssetsLength().call()
    ).resolves.toBe('0');
    await expect(
      accounting.methods.DENOMINATION_ASSET().call()
    ).resolves.toBe(weth.options.address);
    await expect(
      accounting.methods.NATIVE_ASSET().call()
    ).resolves.toBe(weth.options.address);
    await expect(
      accounting.methods.calcSharePrice().call()
    ).resolves.toBe(`${exaUnit}`);

    const initialCalculations = await accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe('0');
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe('0');
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });

  it('updateOwnedAssets removes zero balance asset', async () => {
    const mlnInvestAmt = 10000000;
    await mln.methods.approve(
      participation.options.address, mlnInvestAmt
    ).send(defaultTxOpts);
    await participation.methods
      .requestInvestment(mlnInvestAmt, mlnInvestAmt, mln.options.address)
      .send(Object.assign({value: toWei('1', 'ether')}, defaultTxOpts));

    await testingPriceFeed.methods
      .update([weth.options.address, mln.options.address],
      [`${exaUnit}`, `${exaUnit}`]
    ).send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(user)
      .send(defaultTxOpts)

    const fundHoldingsPreUpdate = await accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldingsPreUpdate[0].length).toEqual(1);
    expect(fundHoldingsPreUpdate[1].length).toEqual(1);

    await participation.methods.redeem().send(defaultTxOpts);

    await accounting.methods
      .updateOwnedAssets()
      .send(defaultTxOpts);
    const fundHoldingsPostUpdate = await accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldingsPostUpdate[0].length).toEqual(0);
    expect(fundHoldingsPostUpdate[1].length).toEqual(0);
  });

  it('updateOwnedAssets does not remove denomination asset at zero balance', async () => {
    const wethInvestAmt = 10000000;
    await weth.methods.approve(
      participation.options.address, wethInvestAmt
    ).send(defaultTxOpts);
    await participation.methods
      .requestInvestment(wethInvestAmt, wethInvestAmt, weth.options.address)
      .send(Object.assign({value: toWei('1', 'ether')}, defaultTxOpts));

    await testingPriceFeed.methods
      .update([weth.options.address, mln.options.address],
      [`${exaUnit}`, `${exaUnit}`]
    ).send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(user)
      .send(defaultTxOpts)

    const fundHoldingsPreUpdate = await accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldingsPreUpdate[0].length).toEqual(1);
    expect(fundHoldingsPreUpdate[1].length).toEqual(1);

    await participation.methods.redeem().send(defaultTxOpts);

    await accounting.methods
      .updateOwnedAssets()
      .send(defaultTxOpts);
    const fundHoldingsPostUpdate = await accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldingsPostUpdate[0].length).toEqual(1);
    expect(fundHoldingsPostUpdate[1].length).toEqual(1);

    await expect(
      accounting.methods
        .isInAssetList(weth.options.address)
        .call(),
    ).resolves.toBe(true);
  });

  it('Balance in vault reflects in accounting', async () => {
    const tokenQuantity = toWei('1', 'ether');
    await weth.methods
      .transfer(vault.options.address, tokenQuantity)
      .send(defaultTxOpts);
    const fundHoldings = await accounting.methods
      .getFundHoldings()
      .call();
    expect(fundHoldings[0][0]).toEqual(tokenQuantity);

    await testingPriceFeed.methods
      .update([weth.options.address], [`${exaUnit}`])
      .send(defaultTxOpts);
    const initialCalculations = await accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe(tokenQuantity);
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe(tokenQuantity);
    // Since there is no investment yet
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });
});
