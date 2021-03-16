import { extractEvent } from '@enzymefinance/ethers';
import {
  feeManagerConfigArgs,
  MockReentrancyToken,
  ReleaseStatusTypes,
  StandardToken,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  buyShares,
  createFundDeployer,
  createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  generateRegisteredMockFees,
  getAssetBalances,
  redeemShares,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment,
    config,
    accounts: [fundOwner, ...remainingAccounts],
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager: deployment.feeManager,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: weth,
  });

  const reentrancyToken = await MockReentrancyToken.deploy(deployer);
  await deployment.chainlinkPriceFeed.addPrimitives(
    [reentrancyToken],
    [config.chainlink.aggregators.dai[0]],
    [config.chainlink.aggregators.dai[1]],
  );

  // Seed some accounts with some weth.
  const seedAmount = utils.parseEther('100');
  const seedAccounts = [fundOwner, remainingAccounts[0], remainingAccounts[1]];
  await Promise.all(seedAccounts.map((account) => weth.transfer(account.address, seedAmount)));

  return {
    weth,
    fees,
    deployer,
    accounts: remainingAccounts,
    config,
    deployment,
    reentrancyToken,
    fund: {
      denominationAsset: weth,
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('buyShares', () => {
  it('does not allow re-entrance', async () => {
    const {
      deployment: { fundDeployer },
      accounts: [signer, buyer],
      reentrancyToken: denominationAsset,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    await denominationAsset.mintFor(signer, investmentAmount);

    const { comptrollerProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    await denominationAsset.makeItReentracyToken(comptrollerProxy);
    await expect(
      buyShares({
        comptrollerProxy,
        signer,
        buyers: [buyer],
        denominationAsset,
        investmentAmounts: [investmentAmount],
      }),
    ).rejects.toBeRevertedWith('Re-entrance');
  });

  it('does not allow a fund that is pending migration', async () => {
    const {
      deployer,
      accounts: [signer, buyer],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      fund: { comptrollerProxy: prevComptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Create a new FundDeployer to migrate to
    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
    });

    // Signal migration
    await nextFundDeployer.connect(fundOwner).signalMigration(vaultProxy, nextComptrollerProxy);

    // buyShares() should fail while migration is pending
    await expect(
      buyShares({
        comptrollerProxy: prevComptrollerProxy,
        signer,
        buyers: [buyer],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Pending migration');

    // If the migration is cancelled, buyShares() should succeed again
    await nextFundDeployer.connect(fundOwner).cancelMigration(vaultProxy);
    await expect(
      buyShares({
        comptrollerProxy: prevComptrollerProxy,
        signer,
        buyers: [buyer],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });

  it.todo('does not allow an asset that fails to reach settlement finality (e.g., an unsettleable Synth)');

  it('works for a fund with no extensions (single buyShares)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [signer, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = utils.parseEther('2');
    const receipt = await buyShares({
      comptrollerProxy,
      signer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Assert Events
    assertEvent(receipt, 'SharesBought', {
      caller: await signer.getAddress(),
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesIssued: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert calls on ComptrollerProxy
    const calcGavCall = await comptrollerProxy.calcGav.args(true).call();
    expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav, {
      gav_: investmentAmount,
      isValid_: true,
    });

    const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
    expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue, {
      grossShareValue_: utils.parseEther('1'),
      isValid_: true,
    });

    // Assert calls on VaultProxy
    // TODO: does this belong here?
    const sharesBuyerBalanceCall = await vaultProxy.balanceOf(buyer);
    expect(sharesBuyerBalanceCall).toEqBigNumber(investmentAmount);
    const sharesTotalSupplyCall = await vaultProxy.totalSupply();
    expect(sharesTotalSupplyCall).toEqBigNumber(sharesBuyerBalanceCall);
    const trackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(trackedAssetsCall).toContain(denominationAsset.address);
    const isTrackedAssetCall = await vaultProxy.isTrackedAsset(denominationAsset);
    expect(isTrackedAssetCall).toBe(true);
  });

  it('fulfills multiple shares orders and emits an event for each', async () => {
    const {
      deployment: { fundDeployer },
      fund: { denominationAsset },
      accounts: [signer, buyer1, buyer2],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = utils.parseEther('2');
    const receipt = await buyShares({
      comptrollerProxy,
      signer,
      buyers: [buyer1, buyer2],
      denominationAsset,
      investmentAmounts: [investmentAmount, investmentAmount],
    });

    // Assert events
    const events = extractEvent(receipt, 'SharesBought');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      caller: await signer.getAddress(),
      buyer: await buyer1.getAddress(),
      investmentAmount,
      sharesIssued: investmentAmount,
      sharesReceived: investmentAmount,
    });
    expect(events[1]).toMatchEventArgs({
      caller: await signer.getAddress(),
      buyer: await buyer2.getAddress(),
      investmentAmount,
      sharesIssued: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert shares balances
    expect(await vaultProxy.balanceOf(buyer1)).toEqBigNumber(investmentAmount);
    expect(await vaultProxy.balanceOf(buyer2)).toEqBigNumber(investmentAmount);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(investmentAmount.mul(2));
  });

  it('works for a fund with a non-18 decimal denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
      fund: { denominationAsset },
      accounts: [signer, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    // Define the investment and expected shares amounts.
    // For 1 unit (10^decimals()) of the denominationAsset, 1 shares unit (10^18) is expected.
    const investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
    const expectedSharesAmount = utils.parseEther('1');
    const receipt = await buyShares({
      comptrollerProxy,
      signer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [expectedSharesAmount],
    });

    // Assert correct event was emitted
    assertEvent(receipt, 'SharesBought', {
      caller: await signer.getAddress(),
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesIssued: expectedSharesAmount,
      sharesReceived: expectedSharesAmount,
    });

    // Assert GAV is the investment amount
    const calcGavCall = await comptrollerProxy.calcGav.args(true).call();
    expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav, {
      gav_: investmentAmount,
      isValid_: true,
    });

    // Assert gross share value is the investment amount
    const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
    expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue, {
      grossShareValue_: investmentAmount,
      isValid_: true,
    });

    // Assert the correct amount of shares was minted to the buyer
    const sharesBuyerBalanceCall = await vaultProxy.balanceOf(buyer);
    expect(sharesBuyerBalanceCall).toEqBigNumber(expectedSharesAmount);
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      deployment: { fundDeployer },
      fund: { denominationAsset },
      accounts: [signer, buyer, fundOwner],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer,
      fundDeployer,
      fundOwner,
      denominationAsset,
    });

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    // The call should fail
    await expect(
      buyShares({
        comptrollerProxy,
        signer,
        buyers: [buyer],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.connect(fundOwner).setOverridePause(true);

    // The call should then succeed
    await expect(
      buyShares({
        comptrollerProxy,
        signer,
        buyers: [buyer],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });
});

describe('redeemShares', () => {
  it('cannot be re-entered', async () => {
    const {
      accounts: [fundManager, investor],
      deployment: { fundDeployer },
      reentrancyToken: denominationAsset,
    } = await provider.snapshot(snapshot);

    await denominationAsset.mintFor(investor, utils.parseEther('10'));

    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [utils.parseEther('2')],
      },
    });

    await denominationAsset.makeItReentracyToken(comptrollerProxy);

    await expect(redeemShares({ comptrollerProxy, signer: investor })).rejects.toBeRevertedWith('Re-entrance');
  });

  it('returns the token revert reason on a failed transfer', async () => {
    const {
      deployer,
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [investmentAmount],
      },
    });

    const mockFailingToken = await StandardToken.mock(deployer);
    await mockFailingToken.balanceOf.given(vaultProxy).returns(utils.parseEther('1'));

    await mockFailingToken.transfer.reverts('my message');

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        additionalAssets: [mockFailingToken],
        quantity: utils.parseEther('1'),
      }),
    ).rejects.toBeRevertedWith('my message');
  });

  it.todo('does not allow an asset that fails to reach settlement finality (e.g., an unsettleable Synth)');

  it('handles a preRedeemSharesHook failure', async () => {
    const {
      accounts: [fundManager, investor],
      fund: { denominationAsset },
      deployment: { fundDeployer },
      fees: { mockContinuousFeeSettleOnly },
    } = await provider.snapshot(snapshot);

    const fees = [mockContinuousFeeSettleOnly];
    const feesSettingsData = [utils.randomBytes(10)];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [investmentAmount],
      },
      feeManagerConfig,
    });

    const invalidFeeSettlementType = 100;
    await mockContinuousFeeSettleOnly.settle.returns(
      invalidFeeSettlementType,
      constants.AddressZero,
      utils.parseEther('0.5'),
    );

    const receipt = await redeemShares({
      comptrollerProxy,
      signer: investor,
    });

    assertEvent(receipt, 'PreRedeemSharesHookFailed', {
      failureReturnData: expect.any(String),
      redeemer: investor,
      sharesQuantity: investmentAmount,
    });
  });

  it('allows sender to redeem all their shares', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    const balanceBefore = await denominationAsset.balanceOf(investor);

    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [investmentAmount],
      },
    });

    await redeemShares({
      comptrollerProxy,
      signer: investor,
    });

    // Redeemer should have their investment amount back and 0 shares
    const sharesBalanceAfter = await vaultProxy.balanceOf(investor);
    expect(sharesBalanceAfter).toEqBigNumber(0);

    const balanceAfter = await denominationAsset.balanceOf(investor);
    expect(balanceAfter).toEqBigNumber(balanceBefore);
  });
});

describe('redeemSharesDetailed', () => {
  it('cannot be re-entered', async () => {
    const {
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
      reentrancyToken: denominationAsset,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    await denominationAsset.mintFor(fundManager, investmentAmount);
    await denominationAsset.mintFor(investor, investmentAmount);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    const redeemQuantity = investmentAmount;

    await denominationAsset.makeItReentracyToken(comptrollerProxy);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: redeemQuantity,
      }),
    ).rejects.toBeRevertedWith('Re-entrance');
  });

  it('does not allow a _sharesQuantity of 0', async () => {
    const {
      accounts: [investor],
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      redeemShares({ comptrollerProxy, signer: investor, quantity: utils.parseEther('0') }),
    ).rejects.toBeRevertedWith('_sharesQuantity must be >0');
  });

  it('does not allow duplicate _additionalAssets', async () => {
    const {
      weth,
      accounts: [investor],
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: utils.parseEther('1'),
        additionalAssets: [weth, weth],
      }),
    ).rejects.toBeRevertedWith('_additionalAssets contains duplicates');
  });

  it('does not allow duplicate _assetsToSkip', async () => {
    const {
      weth,
      accounts: [investor],
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: utils.parseEther('1'),
        assetsToSkip: [weth, weth],
      }),
    ).rejects.toBeRevertedWith('_assetsToSkip contains duplicates');
  });

  it('does not allow a _sharesQuantity greater than the redeemer balance', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    const redeemQuantity = investmentAmount.add(1);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: redeemQuantity,
      }),
    ).rejects.toBeRevertedWith('Insufficient shares');
  });

  it('does not allow a redemption if there are no payoutAssets', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // // Redeem half of investor's shares
    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: investmentAmount.div(2),
        assetsToSkip: [denominationAsset],
      }),
    ).rejects.toBeRevertedWith('No payout assets');
  });

  it('handles a valid call (one additional asset)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
      config: {
        primitives: { mln },
      },
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Send untracked asset directly to fund
    const untrackedAsset = new StandardToken(mln, whales.mln);
    const untrackedAssetBalance = utils.parseEther('2');
    await untrackedAsset.transfer(vaultProxy, untrackedAssetBalance);

    // Assert the asset is not tracked
    const isTrackedAssetCall = await vaultProxy.isTrackedAsset(untrackedAsset);
    expect(isTrackedAssetCall).toBe(false);

    // Define the redemption params and the expected payout assets
    const redeemQuantity = investmentAmount.div(2);
    const additionalAssets = [untrackedAsset];
    const expectedPayoutAssets = [denominationAsset, untrackedAsset];
    const expectedPayoutAmounts = [investmentAmount.div(2), untrackedAssetBalance.div(4)];

    // Record the investor's pre-redemption balances
    const preExpectedPayoutAssetBalances = await getAssetBalances({
      account: investor,
      assets: expectedPayoutAssets,
    });

    // Redeem half of investor's shares
    const receipt = await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemQuantity,
      additionalAssets,
    });

    assertEvent(receipt, 'SharesRedeemed', {
      redeemer: investor,
      sharesQuantity: redeemQuantity,
      receivedAssets: expectedPayoutAssets,
      receivedAssetQuantities: expectedPayoutAmounts,
    });

    const postExpectedPayoutAssetBalances = await getAssetBalances({
      account: investor,
      assets: expectedPayoutAssets,
    });

    // Assert the redeemer has redeemed the correct shares quantity and received the expected assets and balances
    const investorSharesBalanceCall = await vaultProxy.balanceOf(investor);
    expect(investorSharesBalanceCall).toEqBigNumber(investmentAmount.sub(redeemQuantity));

    for (const key in expectedPayoutAssets) {
      const expectedBalance = preExpectedPayoutAssetBalances[key].add(expectedPayoutAmounts[key]);
      expect(postExpectedPayoutAssetBalances[key]).toEqBigNumber(expectedBalance);
    }
  });

  it('handles a valid call (one additional asset and one asset to ignore)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
      config: {
        primitives: { mln },
      },
    } = await provider.snapshot(snapshot);

    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Send untracked asset directly to fund
    const untrackedAsset = new StandardToken(mln, whales.mln);
    const untrackedAssetBalance = utils.parseEther('2');
    await untrackedAsset.transfer(vaultProxy, untrackedAssetBalance);

    // Assert the asset is not tracked
    const isTrackedAssetCall = await vaultProxy.isTrackedAsset(untrackedAsset);
    expect(isTrackedAssetCall).toBe(false);

    // Define the redemption params and the expected payout assets
    const redeemQuantity = investmentAmount.div(2);
    const additionalAssets = [untrackedAsset];
    const assetsToSkip = [denominationAsset];
    const expectedPayoutAssets = [untrackedAsset];
    const expectedPayoutAmounts = [untrackedAssetBalance.div(4)];

    // Record the investor's pre-redemption balances
    const [preExpectedPayoutAssetBalance, preAssetToSkipBalance] = await getAssetBalances({
      account: investor,
      assets: [untrackedAsset, denominationAsset],
    });

    // Redeem half of investor's shares
    const receipt = await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemQuantity,
      additionalAssets,
      assetsToSkip,
    });

    // Assert the event
    assertEvent(receipt, 'SharesRedeemed', {
      redeemer: investor,
      sharesQuantity: redeemQuantity,
      receivedAssets: expectedPayoutAssets,
      receivedAssetQuantities: expectedPayoutAmounts,
    });

    const [postExpectedPayoutAssetBalance, postAssetToSkipBalance] = await getAssetBalances({
      account: investor,
      assets: [untrackedAsset, denominationAsset],
    });

    // Assert the redeemer has redeemed the correct shares quantity and received the expected assets and balances
    const investorSharesBalanceCall = await vaultProxy.balanceOf(investor);
    expect(investorSharesBalanceCall).toEqBigNumber(investmentAmount.sub(redeemQuantity));
    expect(postExpectedPayoutAssetBalance).toEqBigNumber(preExpectedPayoutAssetBalance.add(expectedPayoutAmounts[0]));
    expect(postAssetToSkipBalance).toEqBigNumber(preAssetToSkipBalance);
  });
});

describe('sharesActionTimelock', () => {
  it('does not affect buying or redeeming shares if set to 0', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor, buySharesCaller],
    } = await provider.snapshot(snapshot);

    await denominationAsset.transfer(buySharesCaller, utils.parseEther('10'));

    // Create a new fund, without a timelock
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
    });

    const getSharesActionTimelockCall = await comptrollerProxy.getSharesActionTimelock();
    expect(getSharesActionTimelockCall).toEqBigNumber(0);

    // Buy shares to start the timelock (though the timelock is 0)
    await buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyers: [investor],
      denominationAsset,
    });

    // Immediately buying shares again should succeed
    await buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyers: [investor],
      denominationAsset,
    });

    // Immediately redeeming shares should succeed
    await redeemShares({
      comptrollerProxy,
      signer: investor,
    });
  });

  it('is respected when buying or redeeming shares (no pending migration)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor, buySharesCaller],
    } = await provider.snapshot(snapshot);

    const failureMessage = 'Shares action timelocked';

    // Transfer some weth to the buySharesCaller account.
    await denominationAsset.transfer(buySharesCaller, utils.parseEther('10'));

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
    });

    // Attempting to buy multiple shares for the same user should fail
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [investor, investor],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith(failureMessage);

    // Buy shares to start the timelock
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [investor],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Buying or redeeming shares for the same user should both fail since the timelock has started
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [investor],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith(failureMessage);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith(failureMessage);

    // Buying shares for another party succeeds
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [buySharesCaller],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Warping forward to past the timelock should allow another buy
    await provider.send('evm_increaseTime', [sharesActionTimelock]);

    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [investor],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Warping forward to the timelock should allow a redemption
    await provider.send('evm_increaseTime', [sharesActionTimelock]);

    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).resolves.toBeReceipt();
  });

  it('is skipped when redeeming shares if there is a pending migration', async () => {
    const {
      deployer,
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      fund: { denominationAsset },
      accounts: [fundOwner, investor, buySharesCaller],
    } = await provider.snapshot(snapshot);

    const failureMessage = 'Shares action timelocked';

    // Transfer some weth to the buySharesCaller account.
    await denominationAsset.transfer(buySharesCaller, utils.parseEther('10'));

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
    });

    // Buy shares to start the timelock
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyers: [investor],
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Immediately attempting to redeem shares should fail
    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith(failureMessage);

    // Create a new FundDeployer to migrate to
    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
    });

    // Signal migration
    await nextFundDeployer.connect(fundOwner).signalMigration(vaultProxy, nextComptrollerProxy);

    // Redeeming shares should succeed now that the fund has a migration pending
    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).resolves.toBeReceipt();
  });
});
