import { BigNumber } from 'bignumber.js';

import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';

describe('accounting', () => {
  let s = {};

  beforeAll(async () => {
    s.env = await initTestEnvironment();
    s = {
      ...s,
      ...(await deployMockSystem(s.env, {
        accountingContract: Contracts.Accounting,
      })),
    };

    s.user = s.env.wallet.address;
    s.mockDefaultAssets = [
      s.weth.options.address,
      s.mln.options.address,
    ];

    s.mockQuoteAsset = s.weth.options.address;
    s.mockNativeAsset = s.weth.options.address;
    s.exaUnit = new BigNumber('1e+18');
  });

  it('Accounting is properly initialized', async () => {
    for (const i of Array.from(Array(s.mockDefaultAssets.length).keys())) {
      const defaultAsset = await s.accounting.methods
        .ownedAssets(i)
        .call();
      expect(defaultAsset).toBe(s.mockDefaultAssets[i]);
      await expect(
        s.accounting.methods
          .isInAssetList(s.mockDefaultAssets[i])
          .call(),
      ).resolves.toBe(true);
    }

    await expect(
      s.accounting.methods.DENOMINATION_ASSET().call(),
    ).resolves.toBe(s.mockQuoteAsset);
    await expect(s.accounting.methods.NATIVE_ASSET().call()).resolves.toBe(
      s.mockNativeAsset,
    );
    await expect(
      s.accounting.methods.calcSharePrice().call(),
    ).resolves.toBe(`${s.exaUnit}`);
    await expect(s.accounting.methods.calcGav().call()).resolves.toBe('0');

    const initialCalculations = await s.accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe('0');
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe('0');
    expect(initialCalculations.sharePrice).toBe(`${s.exaUnit}`);
  });

  it('updateOwnedAssets removes zero balance assets', async () => {
    const fundHoldings = await s.accounting.methods
      .getFundHoldings()
      .call();
    expect(fundHoldings[0]).toEqual(
      Array.from(Array(s.mockDefaultAssets.length), () => '0'),
    );

    await s.accounting.methods
      .updateOwnedAssets()
      .send({ from: s.user, gas: 8000000 });

    for (const i of Array.from(Array(s.mockDefaultAssets.length).keys())) {
      if (s.mockDefaultAssets[i] === s.mockQuoteAsset) continue;
      await expect(
        s.accounting.methods
          .isInAssetList(s.mockDefaultAssets[i])
          .call(),
      ).resolves.toBe(false);
    }
  });

  it('Balance in vault reflects in accounting', async () => {
    const tokenQuantity = new BigNumber('1e+18').toString();
    await s.weth.methods
      .transfer(s.vault.options.address, tokenQuantity)
      .send({ from: s.user, gas: 8000000 });
    const fundHoldings = await s.accounting.methods
      .getFundHoldings()
      .call();
    expect(fundHoldings[0][0]).toEqual(tokenQuantity);

    await s.priceSource.methods
      .update([s.weth.options.address], [`${s.exaUnit}`])
      .send({ from: s.user, gas: 8000000 });
    const initialCalculations = await s.accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe(tokenQuantity);
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe(tokenQuantity);
    // Since there is no investment yet
    expect(initialCalculations.sharePrice).toBe(`${s.exaUnit}`);
  });

  // Deployer is an authorized module because it has been directly deployed
  it('Add and remove assets by an authorized module', async () => {
    await expect(
      s.accounting.methods
        .isInAssetList(s.mln.options.address)
        .call(),
    ).resolves.toBe(false);
    await s.accounting.methods
      .addAssetToOwnedAssets(s.mln.options.address)
      .send({ from: s.user, gas: 8000000 });
    await expect(
      s.accounting.methods
        .isInAssetList(s.mln.options.address)
        .call(),
    ).resolves.toBe(true);

    await s.accounting.methods
      .removeFromOwnedAssets(s.mln.options.address)
      .send({ from: s.user, gas: 8000000 });
    await expect(
      s.accounting.methods
        .isInAssetList(s.mln.options.address)
        .call(),
    ).resolves.toBe(false);
  });
});
