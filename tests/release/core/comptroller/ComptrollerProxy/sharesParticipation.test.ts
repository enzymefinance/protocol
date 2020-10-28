import {
  EthereumTestnetProvider,
  extractEvent,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { utils } from 'ethers';
import {
  assertEvent,
  defaultTestDeployment,
  buyShares,
  createNewFund,
  getAssetBalances,
  redeemShares,
  releaseStatusTypes,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      vaultProxy,
    },
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

  it('does not allow a random user if allowedBuySharesCallers is set', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: fundOwner, 1: buyer, 2: randomUser, 3: allowedCaller },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      allowedBuySharesCallers: [allowedCaller],
    });

    // A buyShares tx should fail from a random user
    const badBuySharesTx = buyShares({
      comptrollerProxy,
      signer: randomUser,
      buyer,
      denominationAsset,
    });
    await expect(badBuySharesTx).rejects.toBeRevertedWith(
      'Unauthorized caller',
    );

    // A buyShares tx should succeed from the allowedCaller
    const goodBuySharesTx = buyShares({
      comptrollerProxy,
      signer: allowedCaller,
      buyer,
      denominationAsset,
    });
    await expect(goodBuySharesTx).resolves.toBeReceipt();
  });

  it.todo('test that amgu is sent to the Engine in the above function');
});

describe('allowedBuySharesCallers', () => {
  describe('addAllowedBuySharesCallers', () => {
    it('cannot be called by a random user', async () => {
      const {
        accounts: { 0: randomUser },
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const badAddAllowedBuySharesCallersTx = comptrollerProxy
        .connect(randomUser)
        .addAllowedBuySharesCallers([randomAddress()]);
      await expect(badAddAllowedBuySharesCallersTx).rejects.toBeRevertedWith(
        'Only fund owner callable',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const callersToAdd = [randomAddress(), randomAddress()];

      // Add the allowed callers
      const addAllowedBuySharesCallersTx = comptrollerProxy.addAllowedBuySharesCallers(
        callersToAdd,
      );
      await expect(addAllowedBuySharesCallersTx).resolves.toBeReceipt();

      // Assert state has been set
      const getAllowedBuySharesCallersCall = comptrollerProxy.getAllowedBuySharesCallers();
      await expect(getAllowedBuySharesCallersCall).resolves.toMatchObject(
        callersToAdd,
      );

      for (const added of callersToAdd) {
        const isAllowedBuySharesCallerCall = comptrollerProxy.isAllowedBuySharesCaller(
          added,
        );
        await expect(isAllowedBuySharesCallerCall).resolves.toBe(true);
      }

      // Assert events emitted
      const events = extractEvent(
        await addAllowedBuySharesCallersTx,
        'AllowedBuySharesCallerAdded',
      );
      expect(events.length).toBe(2);
      expect(events[0].args).toMatchObject({
        caller: callersToAdd[0],
      });
      expect(events[1].args).toMatchObject({
        caller: callersToAdd[1],
      });
    });
  });

  describe('removeAllowedBuySharesCallers', () => {
    it('cannot be called by a random user', async () => {
      const {
        accounts: { 0: randomUser },
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const badAddAllowedBuySharesCallersTx = comptrollerProxy
        .connect(randomUser)
        .removeAllowedBuySharesCallers([randomAddress(), randomAddress()]);
      await expect(badAddAllowedBuySharesCallersTx).rejects.toBeRevertedWith(
        'Only fund owner callable',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const callersToRemove = [randomAddress(), randomAddress()];
      const callerToRemain = randomAddress();

      // Add allowed callers, including callers to-be-removed
      const addAllowedBuySharesCallersTx = comptrollerProxy.addAllowedBuySharesCallers(
        [...callersToRemove, callerToRemain],
      );
      await expect(addAllowedBuySharesCallersTx).resolves.toBeReceipt();

      // Remove callers
      const removeAllowedBuySharesCallersTx = comptrollerProxy.removeAllowedBuySharesCallers(
        callersToRemove,
      );
      await expect(removeAllowedBuySharesCallersTx).resolves.toBeReceipt();

      // Assert state has been set
      const getAllowedBuySharesCallersCall = comptrollerProxy.getAllowedBuySharesCallers();
      await expect(getAllowedBuySharesCallersCall).resolves.toMatchObject([
        callerToRemain,
      ]);

      for (const removed of callersToRemove) {
        const isAllowedBuySharesCallerCall = comptrollerProxy.isAllowedBuySharesCaller(
          removed,
        );
        await expect(isAllowedBuySharesCallerCall).resolves.toBe(false);
      }
      const isAllowedBuySharesCallerCall = comptrollerProxy.isAllowedBuySharesCaller(
        callerToRemain,
      );
      await expect(isAllowedBuySharesCallerCall).resolves.toBe(true);

      // Assert events emitted
      const events = extractEvent(
        await removeAllowedBuySharesCallersTx,
        'AllowedBuySharesCallerRemoved',
      );
      expect(events.length).toBe(2);
      expect(events[0].args).toMatchObject({
        caller: callersToRemove[0],
      });
      expect(events[1].args).toMatchObject({
        caller: callersToRemove[1],
      });
    });
  });
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

describe('sharesActionTimelock', () => {
  it('does not affect buying or redeeming shares if set to 0', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: fundManager, 1: investor, 2: buySharesCaller },
    } = await provider.snapshot(snapshot);

    // Create a new fund, without a timelock
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
    });
    const getSharesActionTimelockCall = comptrollerProxy.getSharesActionTimelock();
    await expect(getSharesActionTimelockCall).resolves.toEqBigNumber(0);

    // Buy shares to start the timelock (though the timelock is 0)
    const goodBuySharesTx1 = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });
    await expect(goodBuySharesTx1).resolves.toBeReceipt();

    // Immediately buying shares again should succeed
    const goodBuySharesTx2 = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });
    await expect(goodBuySharesTx2).resolves.toBeReceipt();

    // Immediately redeeming shares should succeed
    const goodRedeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
    });
    await expect(goodRedeemSharesTx).resolves.toBeReceipt();
  });

  it('is respected when buying or redeeming shares', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: fundManager, 1: investor, 2: buySharesCaller },
    } = await provider.snapshot(snapshot);

    const failureMessage = 'Shares action timelocked';

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
    });

    // Buy shares to start the timelock
    const goodBuySharesTx1 = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });
    await expect(goodBuySharesTx1).resolves.toBeReceipt();

    // Buying or redeeming shares for the same user should both fail since the timelock has started
    const badBuySharesTx = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });
    await expect(badBuySharesTx).rejects.toBeRevertedWith(failureMessage);
    const badRedeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
    });
    await expect(badRedeemSharesTx).rejects.toBeRevertedWith(failureMessage);

    // Buying shares for another party succeeds
    const goodBuySharesTx2 = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: buySharesCaller,
      denominationAsset,
    });
    await expect(goodBuySharesTx2).resolves.toBeReceipt();

    // Warping forward to past the timelock should allow another buy
    await provider.send('evm_increaseTime', [sharesActionTimelock]);
    const goodBuySharesTx3 = buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });
    await expect(goodBuySharesTx3).resolves.toBeReceipt();

    // Warping forward to the timelock should allow a redemption
    await provider.send('evm_increaseTime', [sharesActionTimelock]);
    const goodRedeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
    });
    await expect(goodRedeemSharesTx).resolves.toBeReceipt();
  });
});
