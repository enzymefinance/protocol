import { utils } from 'ethers';
import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import {
  assertEvent,
  defaultTestDeployment,
  buyShares,
  createNewFund,
  getAssetBalances,
  redeemShares,
} from '@melonproject/testutils';
import { ReleaseStatusTypes } from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

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
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert Events
    assertEvent(receipt, 'SharesBought', {
      caller: await signer.getAddress(),
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesBought: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert calls on ComptrollerProxy
    const calcGavCall = await comptrollerProxy.calcGav.call();
    expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav.fragment, {
      gav_: investmentAmount,
      isValid_: true,
    });

    const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
    expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue.fragment, {
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

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
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
        buyer,
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
        buyer,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });

  it('does not allow a random user if allowedBuySharesCallers is set', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: [fundOwner, buyer, randomUser, allowedCaller],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      allowedBuySharesCallers: [allowedCaller],
    });

    // A buyShares tx should fail from a random user
    await expect(
      buyShares({
        comptrollerProxy,
        signer: randomUser,
        buyer,
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Unauthorized caller');

    // A buyShares tx should succeed from the allowedCaller
    await expect(
      buyShares({
        comptrollerProxy,
        signer: allowedCaller,
        buyer,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });

  it.todo('test that amgu is sent to the Engine in the above function');
});

describe('allowedBuySharesCallers', () => {
  describe('addAllowedBuySharesCallers', () => {
    it('cannot be called by a random user', async () => {
      const {
        accounts: [randomUser],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        comptrollerProxy.connect(randomUser).addAllowedBuySharesCallers([randomAddress()]),
      ).rejects.toBeRevertedWith('Only fund owner callable');
    });

    it('correctly handles valid call', async () => {
      const {
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const callersToAdd = [randomAddress(), randomAddress()];

      // Add the allowed callers
      const receipt = await comptrollerProxy.addAllowedBuySharesCallers(callersToAdd);

      // Assert state has been set
      const getAllowedBuySharesCallersCall = await comptrollerProxy.getAllowedBuySharesCallers();
      expect(getAllowedBuySharesCallersCall).toMatchObject(callersToAdd);

      for (const added of callersToAdd) {
        const isAllowedBuySharesCallerCall = await comptrollerProxy.isAllowedBuySharesCaller(added);
        expect(isAllowedBuySharesCallerCall).toBe(true);
      }

      // Assert events emitted
      const events = extractEvent(receipt, 'AllowedBuySharesCallerAdded');
      expect(events.length).toBe(2);

      expect(events[0]).toMatchEventArgs({
        caller: callersToAdd[0],
      });

      expect(events[1]).toMatchEventArgs({
        caller: callersToAdd[1],
      });
    });
  });

  describe('removeAllowedBuySharesCallers', () => {
    it('cannot be called by a random user', async () => {
      const {
        accounts: [randomUser],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        comptrollerProxy.connect(randomUser).removeAllowedBuySharesCallers([randomAddress(), randomAddress()]),
      ).rejects.toBeRevertedWith('Only fund owner callable');
    });

    it('correctly handles valid call', async () => {
      const {
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const callersToRemove = [randomAddress(), randomAddress()];
      const callerToRemain = randomAddress();

      // Add allowed callers, including callers to-be-removed
      await comptrollerProxy.addAllowedBuySharesCallers([...callersToRemove, callerToRemain]);

      // Remove callers
      const receipt = await comptrollerProxy.removeAllowedBuySharesCallers(callersToRemove);

      // Assert events emitted
      const event = 'AllowedBuySharesCallerRemoved';
      const events = extractEvent(receipt, event);

      expect(events.length).toBe(2);
      expect(events[0].args).toMatchObject({
        caller: callersToRemove[0],
      });

      expect(events[1].args).toMatchObject({
        caller: callersToRemove[1],
      });

      // Assert state has been set
      const getAllowedBuySharesCallersCall = await comptrollerProxy.getAllowedBuySharesCallers();
      expect(getAllowedBuySharesCallersCall).toMatchObject([callerToRemain]);

      for (const removed of callersToRemove) {
        const isAllowedBuySharesCallerCall = await comptrollerProxy.isAllowedBuySharesCaller(removed);
        expect(isAllowedBuySharesCallerCall).toBe(false);
      }

      const isAllowedBuySharesCallerCall = await comptrollerProxy.isAllowedBuySharesCaller(callerToRemain);
      expect(isAllowedBuySharesCallerCall).toBe(true);
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
        buyer: investor,
        investmentAmount,
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
      accounts: [fundManager, investor],
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
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset, mln: untrackedAsset },
      },
      accounts: [fundManager, investor],
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
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: [fundManager, investor, buySharesCaller],
    } = await provider.snapshot(snapshot);

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
      buyer: investor,
      denominationAsset,
    });

    // Immediately buying shares again should succeed
    await buyShares({
      comptrollerProxy,
      signer: buySharesCaller,
      buyer: investor,
      denominationAsset,
    });

    // Immediately redeeming shares should succeed
    await redeemShares({
      comptrollerProxy,
      signer: investor,
    });
  });

  it('is respected when buying or redeeming shares', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: [fundManager, investor, buySharesCaller],
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
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyer: investor,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Buying or redeeming shares for the same user should both fail since the timelock has started
    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyer: investor,
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
        buyer: buySharesCaller,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Warping forward to past the timelock should allow another buy
    await provider.send('evm_increaseTime', [sharesActionTimelock]);

    await expect(
      buyShares({
        comptrollerProxy,
        signer: buySharesCaller,
        buyer: investor,
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
});
