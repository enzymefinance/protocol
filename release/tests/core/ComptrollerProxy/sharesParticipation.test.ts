import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { utils } from 'ethers';
import { defaultTestDeployment } from '../../../';
import {
  buyShares,
  createNewFund,
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

describe('__redeemShares', () => {
  it.todo('make test todos');

  it.todo('does not allow re-entrance');
});

describe('redeemShares', () => {
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

describe('redeemSharesEmergency', () => {
  it.todo('make test todos');
});

describe('redeemSharesQuantity', () => {
  it.todo('make test todos');
});
