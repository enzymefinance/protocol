import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { constants, utils } from 'ethers';
import { defaultTestDeployment } from '../../../';
import { buyShares, createNewFund, redeemShares } from '../../utils';

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

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      deployment: {
        comptrollerLib,
        engine,
        aggregatedDerivativePriceFeed,
        chainlinkPriceFeed,
        policyManager,
        feeManager,
        integrationManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = comptrollerLib.getRoutes();
    await expect(routesCall).resolves.toMatchObject({
      derivativePriceFeed_: aggregatedDerivativePriceFeed.address,
      feeManager_: feeManager.address,
      integrationManager_: integrationManager.address,
      policyManager_: policyManager.address,
      primitivePriceFeed_: chainlinkPriceFeed.address,
      valueInterpreter_: valueInterpreter.address,
    });

    const engineCall = comptrollerLib.getEngine();
    await expect(engineCall).resolves.toBe(engine.address);

    // The following should be default values

    const denominationAssetCall = comptrollerLib.getDenominationAsset();
    await expect(denominationAssetCall).resolves.toBe(constants.AddressZero);

    const initializedCall = comptrollerLib.getInitialized();
    await expect(initializedCall).resolves.toBe(false);

    const vaultProxyCall = comptrollerLib.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(constants.AddressZero);
  });
});

describe('buyShares', () => {
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

  it.todo('test that amgu is sent to the Engine in the above function');
});

describe('__redeemShares', () => {
  it.todo('make test todos');
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
