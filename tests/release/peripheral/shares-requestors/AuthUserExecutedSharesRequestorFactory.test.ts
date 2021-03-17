import { WETH } from '@enzymefinance/protocol';
import { assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';

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

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const {
      deployment: { authUserExecutedSharesRequestorFactory, authUserExecutedSharesRequestorLib, dispatcher },
    } = await provider.snapshot(snapshot);

    expect(await authUserExecutedSharesRequestorFactory.getAuthUserExecutedSharesRequestorLib()).toMatchAddress(
      authUserExecutedSharesRequestorLib,
    );
    expect(await authUserExecutedSharesRequestorFactory.getDispatcher()).toMatchAddress(dispatcher);
  });
});

describe('deploySharesRequestorProxy', () => {
  it.todo('cannot be called by a non-genuine fund');

  it('can only be called by the fund owner', async () => {
    const {
      deployment: { authUserExecutedSharesRequestorFactory },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    await expect(
      authUserExecutedSharesRequestorFactory.deploySharesRequestorProxy(comptrollerProxy),
    ).rejects.toBeRevertedWith('Only fund owner callable');

    await expect(
      authUserExecutedSharesRequestorFactory.connect(fundOwner).deploySharesRequestorProxy(comptrollerProxy),
    ).resolves.toBeReceipt();
  });

  it('does not allow a second proxy to be created for the same fund', async () => {
    const {
      deployment: { authUserExecutedSharesRequestorFactory },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    // Deploy a shares requestor proxy for a fund for the first time
    await authUserExecutedSharesRequestorFactory.connect(fundOwner).deploySharesRequestorProxy(comptrollerProxy);

    // Attempting to deploy another shares requestor proxy for the same fund should fail
    await expect(
      authUserExecutedSharesRequestorFactory.connect(fundOwner).deploySharesRequestorProxy(comptrollerProxy),
    ).rejects.toBeRevertedWith('Proxy already exists');
  });

  it('correctly handles valid call by creating a correctly configured proxy, associating it with the ComptrollerProxy, and emitting the correct event', async () => {
    const {
      deployment: { authUserExecutedSharesRequestorFactory },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    // Deploy a shares requestor proxy for a fund
    const receipt = await authUserExecutedSharesRequestorFactory
      .connect(fundOwner)
      .deploySharesRequestorProxy(comptrollerProxy);

    // Assert the correct event was emitted
    const sharesRequestorProxyDeployedArgs = assertEvent(receipt, 'SharesRequestorProxyDeployed', {
      comptrollerProxy,
      sharesRequestorProxy: expect.any(String) as string,
    });

    // Assert that the association between ComptrollerProxy and shares requestor proxy is stored
    expect(
      await authUserExecutedSharesRequestorFactory.getSharesRequestorProxyForComptrollerProxy(comptrollerProxy),
    ).toMatchAddress(sharesRequestorProxyDeployedArgs.sharesRequestorProxy);
  });
});
