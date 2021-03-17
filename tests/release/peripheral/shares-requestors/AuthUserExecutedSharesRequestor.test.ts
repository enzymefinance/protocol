import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  AuthUserExecutedSharesRequestorLib,
  AuthUserExecutedSharesRequestorProxy,
  encodeFunctionData,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createAuthUserExecutedSharesRequest,
  createAuthUserExecutedSharesRequestorProxy,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await deployProtocolFixture();

  // Deploy a fund
  const denominationAsset = new WETH(config.weth, whales.weth);
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  // Create a shares requestor proxy for the fund
  const { authUserExecutedSharesRequestorProxy } = await createAuthUserExecutedSharesRequestorProxy({
    signer: fundOwner,
    authUserExecutedSharesRequestorFactory: deployment.authUserExecutedSharesRequestorFactory,
    comptrollerProxy,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      authUserExecutedSharesRequestorProxy,
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      vaultProxy,
    },
  };
}

// No initial state vars set in constructor

describe('init', () => {
  it('cannot be called a second time', async () => {
    const {
      fund: { authUserExecutedSharesRequestorProxy, comptrollerProxy },
    } = await provider.snapshot(snapshot);

    await expect(authUserExecutedSharesRequestorProxy.init(comptrollerProxy)).rejects.toBeRevertedWith(
      'Already initialized',
    );
  });

  it('correctly stores fund vars', async () => {
    const {
      deployment: { authUserExecutedSharesRequestorLib },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Deploy a new shares requestor proxy. Since this isn't going via the factory,
    // it doesn't matter that the fund already has a deployed shares requestor proxy.
    const constructData = encodeFunctionData(authUserExecutedSharesRequestorLib.init.fragment, [comptrollerProxy]);
    const receipt = await AuthUserExecutedSharesRequestorProxy.deploy(
      fundOwner,
      constructData,
      authUserExecutedSharesRequestorLib,
    );
    const proxyContract = new AuthUserExecutedSharesRequestorLib(receipt, fundOwner);

    expect(await proxyContract.getComptrollerProxy()).toMatchAddress(comptrollerProxy);
    expect(await proxyContract.getDenominationAsset()).toMatchAddress(await comptrollerProxy.getDenominationAsset());
    expect(await proxyContract.getFundOwner()).toMatchAddress(await vaultProxy.getOwner());
  });
});

describe('createRequest', () => {
  it('does not allow investmentAmount to be 0', async () => {
    const {
      accounts: [buyer],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    await expect(
      createAuthUserExecutedSharesRequest({
        buyer,
        authUserExecutedSharesRequestorProxy,
        denominationAsset,
        investmentAmount: 0,
      }),
    ).rejects.toBeRevertedWith('_investmentAmount must be > 0');
  });

  it('does not allow new request while another request from the same user is pending', async () => {
    const {
      accounts: [buyer],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(buyer, investmentAmount);

    // First request from `buyer` should succeed
    await createAuthUserExecutedSharesRequest({
      buyer,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount,
    });

    // Second request from `buyer` should fail since there is already a request pending
    await expect(
      createAuthUserExecutedSharesRequest({
        buyer,
        authUserExecutedSharesRequestorProxy,
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('The request owner can only create one request before executed or canceled');
  });

  it('correctly handles valid call by creating a request, custodying the investment asset, and emitting the correct event', async () => {
    const {
      accounts: [buyer],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    const minSharesQuantity = utils.parseEther('1');

    await denominationAsset.transfer(buyer, investmentAmount);

    const preTxSharesRequestorDenominationAssetBalance = await denominationAsset.balanceOf(
      authUserExecutedSharesRequestorProxy,
    );

    // Create the request
    const receipt = await createAuthUserExecutedSharesRequest({
      buyer,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount,
      minSharesQuantity,
    });

    // Assert the request was properly created
    const sharesRequest = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer);
    expect(sharesRequest).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount,
      minSharesQuantity,
    });

    // Assert the investment amount was custodied by the shares requestor
    expect(await denominationAsset.balanceOf(authUserExecutedSharesRequestorProxy)).toEqBigNumber(
      preTxSharesRequestorDenominationAssetBalance.add(investmentAmount),
    );

    // Assert the correct event was emitted
    assertEvent(receipt, 'RequestCreated', {
      requestOwner: buyer,
      investmentAmount,
      minSharesQuantity,
    });
  });

  it('respects the cancellation cooldown period', async () => {
    const {
      accounts: [buyer],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(buyer, investmentAmount);

    // Execute and cancel a request
    await createAuthUserExecutedSharesRequest({
      buyer,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount,
    });

    await authUserExecutedSharesRequestorProxy.connect(buyer).cancelRequest();

    // Second request from `buyer` should fail since they are within the cooldown period
    await expect(
      createAuthUserExecutedSharesRequest({
        buyer,
        authUserExecutedSharesRequestorProxy,
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Cannot create request during cancellation cooldown period');

    // Warp beyond the cancellation cooldown period
    const cooldownTimelock = 60 * 10; // 10 mins
    await provider.send('evm_increaseTime', [cooldownTimelock]);

    // The second request should now succeed
    await expect(
      createAuthUserExecutedSharesRequest({
        buyer,
        authUserExecutedSharesRequestorProxy,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });
});

describe('cancelRequest', () => {
  it('does not allow a non-existent request', async () => {
    const {
      fund: { authUserExecutedSharesRequestorProxy },
    } = await provider.snapshot(snapshot);

    await expect(authUserExecutedSharesRequestorProxy.cancelRequest()).rejects.toBeRevertedWith(
      'Request does not exist',
    );
  });

  it('correctly handles valid call by removing the request, returning the investment asset, and emitting the correct event', async () => {
    const {
      accounts: [buyer],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    const minSharesQuantity = utils.parseEther('1');

    await denominationAsset.transfer(buyer, investmentAmount);

    // Create a request
    await createAuthUserExecutedSharesRequest({
      buyer,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount,
      minSharesQuantity,
    });

    const preCancelBuyerBalance = await denominationAsset.balanceOf(buyer);

    // Cancel the request
    const receipt = await authUserExecutedSharesRequestorProxy.connect(buyer).cancelRequest();

    // Assert the shares request was removed
    const sharesRequest = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer);
    expect(sharesRequest).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount: 0,
      minSharesQuantity: 0,
    });

    // Assert the investment asset was refunded
    expect(await denominationAsset.balanceOf(buyer)).toEqBigNumber(preCancelBuyerBalance.add(investmentAmount));

    // Assert the correct event was emitted
    assertEvent(receipt, 'RequestCanceled', {
      requestOwner: buyer,
      investmentAmount,
      minSharesQuantity,
    });
  });
});

describe('executeRequests', () => {
  it('does not allow a random caller', async () => {
    const {
      accounts: [randomUser],
      fund: { authUserExecutedSharesRequestorProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      authUserExecutedSharesRequestorProxy.connect(randomUser).executeRequests([randomAddress()]),
    ).rejects.toBeRevertedWith('Invalid caller');
  });

  it('does not allow requestOwners to be empty', async () => {
    const {
      fund: { authUserExecutedSharesRequestorProxy },
    } = await provider.snapshot(snapshot);

    await expect(authUserExecutedSharesRequestorProxy.executeRequests([])).rejects.toBeRevertedWith(
      '_requestOwners can not be empty',
    );
  });

  it('correctly handles valid call (from the fund owner) by buying shares, removing the request, and emitting the correct event (for each request)', async () => {
    const {
      accounts: [buyer1, buyer2],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Define two requests
    const investmentAmount1 = utils.parseEther('2');
    const minSharesQuantity1 = utils.parseEther('1');
    const investmentAmount2 = utils.parseEther('0.5');
    const minSharesQuantity2 = utils.parseEther('0.5');

    await denominationAsset.transfer(buyer1, investmentAmount1);
    await denominationAsset.transfer(buyer2, investmentAmount2);

    // Create requests from two buyers
    await createAuthUserExecutedSharesRequest({
      buyer: buyer1,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount: investmentAmount1,
      minSharesQuantity: minSharesQuantity1,
    });

    await createAuthUserExecutedSharesRequest({
      buyer: buyer2,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount: investmentAmount2,
      minSharesQuantity: minSharesQuantity2,
    });

    const preExecuteBuyer1Shares = await vaultProxy.balanceOf(buyer1);
    const preExecuteBuyer2Shares = await vaultProxy.balanceOf(buyer2);

    // Execute the requests
    const receipt = await authUserExecutedSharesRequestorProxy.executeRequests([buyer1, buyer2]);

    // Assert the correct amounts of shares were purchased
    expect(await vaultProxy.balanceOf(buyer1)).toEqBigNumber(preExecuteBuyer1Shares.add(investmentAmount1));
    expect(await vaultProxy.balanceOf(buyer2)).toEqBigNumber(preExecuteBuyer2Shares.add(investmentAmount2));

    // Assert both shares requests were removed
    const sharesRequest1 = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer1);
    expect(sharesRequest1).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount: 0,
      minSharesQuantity: 0,
    });
    const sharesRequest2 = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer2);
    expect(sharesRequest2).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount: 0,
      minSharesQuantity: 0,
    });

    // Assert the correct events were emitted
    const events = extractEvent(receipt, 'RequestExecuted');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      caller: fundOwner,
      requestOwner: buyer1,
      investmentAmount: investmentAmount1,
      minSharesQuantity: minSharesQuantity1,
    });
    expect(events[1]).toMatchEventArgs({
      caller: fundOwner,
      requestOwner: buyer2,
      investmentAmount: investmentAmount2,
      minSharesQuantity: minSharesQuantity2,
    });
  });

  // This test is exact the same as the preceding test, other than including a non-existent request
  it('correctly skips a non-existent request', async () => {
    const {
      accounts: [buyer1, buyer2],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Define two requests
    const investmentAmount1 = utils.parseEther('2');
    const minSharesQuantity1 = utils.parseEther('1');
    const investmentAmount2 = utils.parseEther('0.5');
    const minSharesQuantity2 = utils.parseEther('0.5');

    await denominationAsset.transfer(buyer1, investmentAmount1);
    await denominationAsset.transfer(buyer2, investmentAmount2);

    // Create requests from two buyers
    await createAuthUserExecutedSharesRequest({
      buyer: buyer1,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount: investmentAmount1,
      minSharesQuantity: minSharesQuantity1,
    });

    await createAuthUserExecutedSharesRequest({
      buyer: buyer2,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount: investmentAmount2,
      minSharesQuantity: minSharesQuantity2,
    });

    const preExecuteBuyer1Shares = await vaultProxy.balanceOf(buyer1);
    const preExecuteBuyer2Shares = await vaultProxy.balanceOf(buyer2);

    // Execute the requests
    const receipt = await authUserExecutedSharesRequestorProxy.executeRequests([buyer1, randomAddress(), buyer2]);

    // Assert the correct amounts of shares were purchased
    expect(await vaultProxy.balanceOf(buyer1)).toEqBigNumber(preExecuteBuyer1Shares.add(investmentAmount1));
    expect(await vaultProxy.balanceOf(buyer2)).toEqBigNumber(preExecuteBuyer2Shares.add(investmentAmount2));

    // Assert both shares requests were removed
    const sharesRequest1 = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer1);
    expect(sharesRequest1).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount: 0,
      minSharesQuantity: 0,
    });
    const sharesRequest2 = await authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner(buyer2);
    expect(sharesRequest2).toMatchFunctionOutput(authUserExecutedSharesRequestorProxy.getSharesRequestInfoForOwner, {
      investmentAmount: 0,
      minSharesQuantity: 0,
    });

    // Assert the correct events were emitted
    const events = extractEvent(receipt, 'RequestExecuted');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      caller: fundOwner,
      requestOwner: buyer1,
      investmentAmount: investmentAmount1,
      minSharesQuantity: minSharesQuantity1,
    });
    expect(events[1]).toMatchEventArgs({
      caller: fundOwner,
      requestOwner: buyer2,
      investmentAmount: investmentAmount2,
      minSharesQuantity: minSharesQuantity2,
    });
  });

  it('is callable by a requestExecutor', async () => {
    const {
      accounts: [buyer, requestExecutor],
      fund: { authUserExecutedSharesRequestorProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    // Add the requestExecutor
    await authUserExecutedSharesRequestorProxy.addRequestExecutors([requestExecutor]);

    // Create a request from a 3rd party
    const investmentAmount = utils.parseEther('2');
    await denominationAsset.transfer(buyer, investmentAmount);

    const minSharesQuantity = utils.parseEther('1');
    await createAuthUserExecutedSharesRequest({
      buyer,
      authUserExecutedSharesRequestorProxy,
      denominationAsset,
      investmentAmount,
      minSharesQuantity,
    });

    // Executing the request by the requestExecutor should succeed
    const receipt = await authUserExecutedSharesRequestorProxy.connect(requestExecutor).executeRequests([buyer]);

    // Assert the caller in the event is the requestExecutor
    assertEvent(receipt, 'RequestExecuted', {
      caller: requestExecutor,
      requestOwner: buyer,
      investmentAmount,
      minSharesQuantity,
    });
  });
});

describe('request executors', () => {
  describe('addRequestExecutors', () => {
    it('does not allow a random caller', async () => {
      const {
        accounts: [randomUser],
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        authUserExecutedSharesRequestorProxy.connect(randomUser).addRequestExecutors([randomAddress()]),
      ).rejects.toBeRevertedWith('Only fund owner callable');
    });

    it('does not allow an empty _requestExecutors', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      await expect(authUserExecutedSharesRequestorProxy.addRequestExecutors([])).rejects.toBeRevertedWith(
        'Empty _requestExecutors',
      );
    });

    it('does not allow an already-added request executor', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      const newRequestExecutor = randomAddress();
      await authUserExecutedSharesRequestorProxy.addRequestExecutors([newRequestExecutor]);

      await expect(
        authUserExecutedSharesRequestorProxy.addRequestExecutors([newRequestExecutor]),
      ).rejects.toBeRevertedWith('Value already set');
    });

    it('does not allow setting the fund owner', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(authUserExecutedSharesRequestorProxy.addRequestExecutors([fundOwner])).rejects.toBeRevertedWith(
        'The fund owner cannot be added',
      );
    });

    it('correctly handles a valid call by adding the request executors and emitting the correct events', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      const newRequestExecutors = [randomAddress(), randomAddress()];

      // isRequestExecutor should be false for each account
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[0])).toBe(false);
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[1])).toBe(false);

      // Set the accounts as request executors
      const receipt = await authUserExecutedSharesRequestorProxy.addRequestExecutors(newRequestExecutors);

      // isRequestExecutor should now be true for each account
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[0])).toBe(true);
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[1])).toBe(true);

      // Assert the correct events were emitted
      const events = extractEvent(receipt, 'RequestExecutorAdded');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        account: newRequestExecutors[0],
      });
      expect(events[1]).toMatchEventArgs({
        account: newRequestExecutors[1],
      });
    });
  });

  describe('removeRequestExecutors', () => {
    it('does not allow a random caller', async () => {
      const {
        accounts: [randomUser],
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        authUserExecutedSharesRequestorProxy.connect(randomUser).removeRequestExecutors([randomAddress()]),
      ).rejects.toBeRevertedWith('Only fund owner callable');
    });

    it('does not allow an empty _requestExecutors', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      await expect(authUserExecutedSharesRequestorProxy.removeRequestExecutors([])).rejects.toBeRevertedWith(
        'Empty _requestExecutors',
      );
    });

    it('does not allow a non-existent request executor', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        authUserExecutedSharesRequestorProxy.removeRequestExecutors([randomAddress()]),
      ).rejects.toBeRevertedWith('Account is not a request executor');
    });

    it('correctly handles a valid call by removing the request executors and emitting the correct events', async () => {
      const {
        fund: { authUserExecutedSharesRequestorProxy },
      } = await provider.snapshot(snapshot);

      // Add request executors so they can then be removed
      const newRequestExecutors = [randomAddress(), randomAddress()];
      await authUserExecutedSharesRequestorProxy.addRequestExecutors(newRequestExecutors);

      // isRequestExecutor should be true for each account
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[0])).toBe(true);
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[1])).toBe(true);

      // Set the accounts as request executors
      const receipt = await authUserExecutedSharesRequestorProxy.removeRequestExecutors(newRequestExecutors);

      // isRequestExecutor should now be false for each account
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[0])).toBe(false);
      expect(await authUserExecutedSharesRequestorProxy.isRequestExecutor(newRequestExecutors[1])).toBe(false);

      // Assert the correct events were emitted
      const events = extractEvent(receipt, 'RequestExecutorRemoved');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        account: newRequestExecutors[0],
      });
      expect(events[1]).toMatchEventArgs({
        account: newRequestExecutors[1],
      });
    });
  });
});
