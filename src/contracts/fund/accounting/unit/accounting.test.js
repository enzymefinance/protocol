import { toWei } from 'web3-utils';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';

describe('accounting', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;
  let shares;
  let mockDefaultAssets, mockNativeAsset, mockQuoteAsset;
  let exaUnit;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    mockSystem = await deployMockSystem(
      environment,
      { accountingContract: CONTRACT_NAMES.ACCOUNTING }
    );

    mockDefaultAssets = [
      mockSystem.weth.options.address,
      mockSystem.mln.options.address,
    ];
    mockQuoteAsset = mockSystem.weth.options.address;
    mockNativeAsset = mockSystem.weth.options.address;
    exaUnit = toWei('1', 'ether');
  });

  it('Accounting is properly initialized', async () => {
    for (const i in mockDefaultAssets) {
      const defaultAsset = await mockSystem.accounting.methods
        .ownedAssets(i)
        .call();
      expect(defaultAsset).toBe(mockDefaultAssets[i]);
      await expect(
        mockSystem.accounting.methods
          .isInAssetList(mockDefaultAssets[i])
          .call(),
      ).resolves.toBe(true);
    }

    await expect(
      mockSystem.accounting.methods.DENOMINATION_ASSET().call()
    ).resolves.toBe(mockQuoteAsset);
    await expect(
      mockSystem.accounting.methods.NATIVE_ASSET().call()
    ).resolves.toBe(mockNativeAsset);
    await expect(
      mockSystem.accounting.methods.calcSharePrice().call()
    ).resolves.toBe(`${exaUnit}`);
    await expect(
      mockSystem.accounting.methods.calcGav().call()
    ).resolves.toBe('0');

    const initialCalculations = await mockSystem.accounting.methods
      .performCalculations()
      .call();

    expect(initialCalculations.gav).toBe('0');
    expect(initialCalculations.feesInDenominationAsset).toBe('0');
    expect(initialCalculations.feesInShares).toBe('0');
    expect(initialCalculations.nav).toBe('0');
    expect(initialCalculations.sharePrice).toBe(`${exaUnit}`);
  });

  it('updateOwnedAssets removes zero balance assets', async () => {
    const fundHoldings = await mockSystem.accounting.methods
      .getFundHoldings()
      .call();

    expect(fundHoldings[0]).toEqual(
      new Array(mockDefaultAssets.length).fill('0')
    );

    await mockSystem.accounting.methods
      .updateOwnedAssets()
      .send(defaultTxOpts);

    for (const i in mockDefaultAssets) {
      if (mockDefaultAssets[i] === mockQuoteAsset) continue;
      await expect(
        mockSystem.accounting.methods
          .isInAssetList(mockDefaultAssets[i])
          .call(),
      ).resolves.toBe(false);
    }
  });

  it('Balance in vault reflects in accounting', async () => {
    const tokenQuantity = toWei('1', 'ether');
    await mockSystem.weth.methods
      .transfer(mockSystem.vault.options.address, tokenQuantity)
      .send(defaultTxOpts);
    const fundHoldings = await mockSystem.accounting.methods
      .getFundHoldings()
      .call();
    expect(fundHoldings[0][0]).toEqual(tokenQuantity);

    await mockSystem.priceSource.methods
      .update([mockSystem.weth.options.address], [`${exaUnit}`])
      .send(defaultTxOpts);
    const initialCalculations = await mockSystem.accounting.methods
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
      mockSystem.accounting.methods
        .isInAssetList(mockSystem.mln.options.address)
        .call(),
    ).resolves.toBe(false);
    await mockSystem.accounting.methods
      .addAssetToOwnedAssets(mockSystem.mln.options.address)
      .send(defaultTxOpts);
    await expect(
      mockSystem.accounting.methods
        .isInAssetList(mockSystem.mln.options.address)
        .call(),
    ).resolves.toBe(true);

    await mockSystem.accounting.methods
      .removeFromOwnedAssets(mockSystem.mln.options.address)
      .send(defaultTxOpts);
    await expect(
      mockSystem.accounting.methods
        .isInAssetList(mockSystem.mln.options.address)
        .call(),
    ).resolves.toBe(false);
  });
});
