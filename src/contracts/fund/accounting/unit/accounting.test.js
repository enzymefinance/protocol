import { toWei } from 'web3-utils';

const setupInvestedTestFund = require('../../../../tests/utils/new/setupInvestedTestFund');
const web3 = require('../../../../../deploy/utils/get-web3');
const deploySystem = require('../../../../../deploy/scripts/deploy-system');

describe('accounting', () => {
  let user, defaultTxOpts;
  let defaultAssets, nativeAsset, quoteAsset;
  let contracts;
  let fund;
  let exaUnit;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    contracts = deployment.contracts;

    const { WETH, MLN } = contracts;

    fund = await setupInvestedTestFund(contracts, user);

    defaultAssets = [
      WETH.options.address,
      MLN.options.address,
    ];
    quoteAsset = WETH.options.address;
    nativeAsset = WETH.options.address;
    exaUnit = toWei('1', 'ether');
  });

  it('Accounting is properly initialized', async () => {
    for (const i in defaultAssets) {
      const defaultAsset = await fund.accounting.methods
        .ownedAssets(i)
        .call();
      expect(defaultAsset).toBe(defaultAssets[i]);
      await expect(
        fund.accounting.methods
          .isInAssetList(defaultAssets[i])
          .call(),
      ).resolves.toBe(true);
    }

    await expect(
      fund.accounting.methods.DENOMINATION_ASSET().call()
    ).resolves.toBe(quoteAsset);
    await expect(
      fund.accounting.methods.NATIVE_ASSET().call()
    ).resolves.toBe(nativeAsset);
    await expect(
      fund.accounting.methods.calcSharePrice().call()
    ).resolves.toBe(`${exaUnit}`);
    await expect(
      fund.accounting.methods.calcGav().call()
    ).resolves.toBe('0');

    const initialCalculations = await fund.accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe('0');
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe('0');
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });

  it('updateOwnedAssets removes zero balance assets', async () => {

    const fundHoldings = await fund.accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldings[0]).toEqual(
      new Array(defaultAssets.length).fill('0')
    );

    await fund.accounting.methods
      .updateOwnedAssets()
      .send(defaultTxOpts);

    for (const i in defaultAssets) {
      if (defaultAssets[i] === quoteAsset) continue;
      await expect(
        fund.accounting.methods
          .isInAssetList(defaultAssets[i])
          .call(),
      ).resolves.toBe(false);
    }
  });

  it('Balance in vault reflects in accounting', async () => {
    const { WETH, TestingPriceFeed } = contracts;
    const tokenQuantity = toWei('1', 'ether');
    await WETH.methods
      .transfer(fund.vault.options.address, tokenQuantity)
      .send(defaultTxOpts);
    const fundHoldings = await fund.accounting.methods
      .getFundHoldings()
      .call();
    expect(fundHoldings[0][0]).toEqual(tokenQuantity);

    await TestingPriceFeed.methods
      .update([WETH.options.address], [`${exaUnit}`])
      .send(defaultTxOpts);
    const initialCalculations = await fund.accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe(tokenQuantity);
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe(tokenQuantity);
    // Since there is no investment yet
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });

  // Deployer is an authorized module because it has been directly deployed
  it('Add and remove assets by an authorized module', async () => {
    const { MLN } = contracts;

    await expect(
      fund.accounting.methods
        .isInAssetList(MLN.options.address)
        .call(),
    ).resolves.toBe(false);
    await fund.accounting.methods
      .addAssetToOwnedAssets(MLN.options.address)
      .send(defaultTxOpts);
    await expect(
      fund.accounting.methods
        .isInAssetList(MLN.options.address)
        .call(),
    ).resolves.toBe(true);

    await fund.accounting.methods
      .removeFromOwnedAssets(MLN.options.address)
      .send(defaultTxOpts);
    await expect(
      fund.accounting.methods
        .isInAssetList(MLN.options.address)
        .call(),
    ).resolves.toBe(false);
  });
});
