import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { utils } from 'ethers';
import { defaultTestDeployment } from '../../../';
import {
  buyShares,
  createNewFund,
  getAssetBalances,
  redeemShares,
  releaseStatusTypes,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

describe('buyShares', () => {
  it.todo('does not allow re-entrance');

  it('works for a fund with no extensions', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: signer, 1: buyer },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = utils.parseEther('2');

    const buySharesTx = buyShares({
      comptrollerProxy,
      signer,
      buyer,
      denominationAsset,
      investmentAmount,
    });
    await expect(buySharesTx).resolves.toBeReceipt();

    // Assert Events
    await assertEvent(buySharesTx, 'SharesBought', {
      caller: await signer.getAddress(),
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesBought: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert calls on ComptrollerProxy
    const calcGavCall = comptrollerProxy.calcGav.call();
    await expect(calcGavCall).resolves.toEqBigNumber(investmentAmount);

    const calcGrossShareValueCall = comptrollerProxy.calcGrossShareValue.call();
    await expect(calcGrossShareValueCall).resolves.toEqBigNumber(
      utils.parseEther('1'),
    );

    // Assert calls on VaultProxy
    // TODO: does this belong here?
    const sharesBuyerBalanceCall = vaultProxy.balanceOf(buyer);
    await expect(sharesBuyerBalanceCall).resolves.toEqBigNumber(
      investmentAmount,
    );
    const sharesTotalSupplyCall = vaultProxy.totalSupply();
    await expect(sharesTotalSupplyCall).resolves.toEqBigNumber(
      await sharesBuyerBalanceCall,
    );
    const trackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(trackedAssetsCall).resolves.toContain(
      denominationAsset.address,
    );
    const isTrackedAssetCall = vaultProxy.isTrackedAsset(denominationAsset);
    await expect(isTrackedAssetCall).resolves.toBe(true);
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: signer, 1: buyer, 2: fundOwner },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer,
      fundDeployer,
      fundOwner,
      denominationAsset,
    });

    // Pause the release
    await fundDeployer.setReleaseStatus(releaseStatusTypes.Paused);

    // The call should fail
    const badBuySharesTx = buyShares({
      comptrollerProxy,
      signer,
      buyer,
      denominationAsset,
    });
    await expect(badBuySharesTx).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.connect(fundOwner).setOverridePause(true);

    // The call should then succeed
    const goodBuySharesTx = buyShares({
      comptrollerProxy,
      signer,
      buyer,
      denominationAsset,
    });
    await expect(goodBuySharesTx).resolves.toBeReceipt();
  });

  it.todo('test that amgu is sent to the Engine in the above function');
});

describe('redeemShares', () => {
  it.todo('cannot be re-entered');

  it.todo('handles the preRedeemSharesHook (can merge with standard test)');

  it.todo('handles a preRedeemSharesHook failure');

  it('allows sender to redeem all their shares', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: fundManager, 1: investor },
    } = await provider.snapshot(snapshot);

    const preBuyInvestorInvestmentAssetBalanceCall = denominationAsset.balanceOf(
      investor,
    );

    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyer: investor,
        investmentAmount,
      },
    });

    const redeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
    });
    await expect(redeemSharesTx).resolves.toBeReceipt();

    // Redeemer should have their investment amount back and 0 shares
    const investorSharesBalanceCall = vaultProxy.balanceOf(investor);
    await expect(investorSharesBalanceCall).resolves.toEqBigNumber(0);

    const postRedeemInvestorInvestmentAssetBalanceCall = denominationAsset.balanceOf(
      investor,
    );
    await expect(
      postRedeemInvestorInvestmentAssetBalanceCall,
    ).resolves.toEqBigNumber(await preBuyInvestorInvestmentAssetBalanceCall);
  });
});

describe('redeemSharesDetailed', () => {
  it.todo('does not allow a _sharesQuantity of 0');

  it.todo('does not allow duplicate _additionalAssets');

  it.todo('does not allow duplicate _assetsToSkip');

  it.todo('does not allow a _sharesQuantity greater than the redeemer balance');

  it.todo('does not allow a redemption if there are no payoutAssets');

  it('handles a valid call (one additional asset)', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset, mln: untrackedAsset },
      },
      accounts: { 0: fundManager, 1: investor },
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyer: fundManager,
        investmentAmount,
      },
    });
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyer: investor,
      denominationAsset,
      investmentAmount,
    });

    // Send untracked asset directly to fund
    const untrackedAssetBalance = utils.parseEther('2');
    await untrackedAsset.transfer(vaultProxy, untrackedAssetBalance);

    // Assert the asset is not tracked
    const isTrackedAssetCall = vaultProxy.isTrackedAsset(untrackedAsset);
    await expect(isTrackedAssetCall).resolves.toBe(false);

    // Define the redemption params and the expected payout assets
    const redeemQuantity = investmentAmount.div(2);
    const additionalAssets = [untrackedAsset];
    const expectedPayoutAssets = [denominationAsset, untrackedAsset];
    const expectedPayoutAmounts = [
      investmentAmount.div(2),
      untrackedAssetBalance.div(4),
    ];

    // Record the investor's pre-redemption balances
    const preExpectedPayoutAssetBalances = await getAssetBalances({
      account: investor,
      assets: expectedPayoutAssets,
    });

    // Redeem half of investor's shares
    const redeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemQuantity,
      additionalAssets,
    });
    await expect(redeemSharesTx).resolves.toBeReceipt();

    const postExpectedPayoutAssetBalances = await getAssetBalances({
      account: investor,
      assets: expectedPayoutAssets,
    });

    // Assert the redeemer has redeemed the correct shares quantity and received the expected assets and balances
    const investorSharesBalanceCall = vaultProxy.balanceOf(investor);
    await expect(investorSharesBalanceCall).resolves.toEqBigNumber(
      investmentAmount.sub(redeemQuantity),
    );

    for (const key in expectedPayoutAssets) {
      const expectedBalance = preExpectedPayoutAssetBalances[key].add(
        expectedPayoutAmounts[key],
      );
      expect(postExpectedPayoutAssetBalances[key]).toEqBigNumber(
        expectedBalance,
      );
    }

    // Assert the event
    await assertEvent(redeemSharesTx, 'SharesRedeemed', {
      redeemer: await resolveAddress(investor),
      sharesQuantity: redeemQuantity,
      receivedAssets: expectedPayoutAssets.map((token) => token.address),
      receivedAssetQuantities: expectedPayoutAmounts,
    });
  });

  it('handles a valid call (one additional asset and one asset to ignore)', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset, mln: untrackedAsset },
      },
      accounts: { 0: fundManager, 1: investor },
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyer: fundManager,
        investmentAmount,
      },
    });
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyer: investor,
      denominationAsset,
      investmentAmount,
    });

    // Send untracked asset directly to fund
    const untrackedAssetBalance = utils.parseEther('2');
    await untrackedAsset.transfer(vaultProxy, untrackedAssetBalance);

    // Assert the asset is not tracked
    const isTrackedAssetCall = vaultProxy.isTrackedAsset(untrackedAsset);
    await expect(isTrackedAssetCall).resolves.toBe(false);

    // Define the redemption params and the expected payout assets
    const redeemQuantity = investmentAmount.div(2);
    const additionalAssets = [untrackedAsset];
    const assetsToSkip = [denominationAsset];
    const expectedPayoutAssets = [untrackedAsset];
    const expectedPayoutAmounts = [untrackedAssetBalance.div(4)];

    // Record the investor's pre-redemption balances
    const [
      preExpectedPayoutAssetBalance,
      preAssetToSkipBalance,
    ] = await getAssetBalances({
      account: investor,
      assets: [untrackedAsset, denominationAsset],
    });

    // Redeem half of investor's shares
    const redeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemQuantity,
      additionalAssets,
      assetsToSkip,
    });
    await expect(redeemSharesTx).resolves.toBeReceipt();

    const [
      postExpectedPayoutAssetBalance,
      postAssetToSkipBalance,
    ] = await getAssetBalances({
      account: investor,
      assets: [untrackedAsset, denominationAsset],
    });

    // Assert the redeemer has redeemed the correct shares quantity and received the expected assets and balances
    const investorSharesBalanceCall = vaultProxy.balanceOf(investor);
    await expect(investorSharesBalanceCall).resolves.toEqBigNumber(
      investmentAmount.sub(redeemQuantity),
    );
    expect(postExpectedPayoutAssetBalance).toEqBigNumber(
      preExpectedPayoutAssetBalance.add(expectedPayoutAmounts[0]),
    );
    expect(postAssetToSkipBalance).toEqBigNumber(preAssetToSkipBalance);

    // Assert the event
    await assertEvent(redeemSharesTx, 'SharesRedeemed', {
      redeemer: await resolveAddress(investor),
      sharesQuantity: redeemQuantity,
      receivedAssets: expectedPayoutAssets.map((token) => token.address),
      receivedAssetQuantities: expectedPayoutAmounts,
    });
  });
});

it.todo('tests for disallowing atomic shares actions');
