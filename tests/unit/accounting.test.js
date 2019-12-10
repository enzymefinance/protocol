import { toWei } from 'web3-utils';

import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('accounting', () => {
  let user, defaultTxOpts;
  let defaultAssets, nativeAsset, quoteAsset;
  let contracts;
  let deployed;
  let fund;
  let accounting, vault, testingPriceFeed, weth, mln;
  const exaUnit = toWei('1', 'ether');

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    deployed = await deployMockSystem({
      accountingContract: CONTRACT_NAMES.ACCOUNTING
    });
    accounting = deployed.accounting;
    vault = deployed.vault;
    testingPriceFeed = deployed.priceSource;
    weth = deployed.weth;
    mln = deployed.mln;

    defaultAssets = [
      weth.options.address,
      mln.options.address,
    ];
    quoteAsset = weth.options.address;
    nativeAsset = weth.options.address;
  });

  it('Accounting is properly initialized', async () => {
    for (const i in defaultAssets) {
      const defaultAsset = await deployed.accounting.methods
        .ownedAssets(i)
        .call();
      expect(defaultAsset).toBe(defaultAssets[i]);
      await expect(
        accounting.methods
          .isInAssetList(defaultAssets[i])
          .call(),
      ).resolves.toBe(true);
    }

    await expect(
      accounting.methods.DENOMINATION_ASSET().call()
    ).resolves.toBe(quoteAsset);
    await expect(
      accounting.methods.NATIVE_ASSET().call()
    ).resolves.toBe(nativeAsset);
    await expect(
      accounting.methods.calcSharePrice().call()
    ).resolves.toBe(`${exaUnit}`);
    await expect(
      accounting.methods.calcGav().call()
    ).resolves.toBe('0');

    const initialCalculations = await accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe('0');
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe('0');
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });

  it('updateOwnedAssets removes zero balance assets', async () => {

    const fundHoldings = await accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldings[0]).toEqual(
      new Array(defaultAssets.length).fill('0')
    );

    await accounting.methods
      .updateOwnedAssets()
      .send(defaultTxOpts);

    for (const i in defaultAssets) {
      if (defaultAssets[i] === quoteAsset) continue;
      await expect(
        accounting.methods
          .isInAssetList(defaultAssets[i])
          .call(),
      ).resolves.toBe(false);
    }
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

  // Deployer is an authorized module because it has been directly deployed
  it('Add and remove assets by an authorized module', async () => {
    await expect(
      accounting.methods
        .isInAssetList(mln.options.address)
        .call(),
    ).resolves.toBe(false);
    await accounting.methods
      .addAssetToOwnedAssets(mln.options.address)
      .send(defaultTxOpts);
    await expect(
      accounting.methods
        .isInAssetList(mln.options.address)
        .call(),
    ).resolves.toBe(true);

    await accounting.methods
      .removeFromOwnedAssets(mln.options.address)
      .send(defaultTxOpts);
    await expect(
      accounting.methods
        .isInAssetList(mln.options.address)
        .call(),
    ).resolves.toBe(false);
  });
});
