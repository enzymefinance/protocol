import { BigNumber, constants } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      config: {
        integratees: { synthetix },
      },
      deployment: {
        comptrollerLib,
        dispatcher,
        feeManager,
        fundDeployer,
        fundLifecycleLib,
        integrationManager,
        permissionedVaultActionLib,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = await comptrollerLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(comptrollerLib.getLibRoutes, {
      dispatcher_: dispatcher,
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      fundLifecycleLib_: fundLifecycleLib,
      integrationManager_: integrationManager,
      permissionedVaultActionLib_: permissionedVaultActionLib,
      policyManager_: policyManager,
      valueInterpreter_: valueInterpreter,
    });

    const getSynthetixAddressResolverCall = await comptrollerLib.getSynthetixAddressResolver();
    expect(getSynthetixAddressResolverCall).toMatchAddress(synthetix.addressResolver);

    const getSynthetixPriceFeedCall = await comptrollerLib.getSynthetixPriceFeed();
    expect(getSynthetixPriceFeedCall).toMatchAddress(synthetixPriceFeed);

    // The following should be default values
    const denominationAssetCall = await comptrollerLib.getDenominationAsset();
    expect(denominationAssetCall).toMatchAddress(constants.AddressZero);

    const vaultProxyCall = await comptrollerLib.getVaultProxy();
    expect(vaultProxyCall).toMatchAddress(constants.AddressZero);
  });
});

describe('redeemShares', () => {
  it('can not be called directly (delegatecalled only)', async () => {
    const {
      deployment: { comptrollerLib },
    } = await provider.snapshot(snapshot);

    await expect(comptrollerLib.redeemShares()).rejects.toBeReverted();
  });
});

describe('redeemSharesDetailed', () => {
  it('can not be called directly (delegatecalled only)', async () => {
    const {
      deployment: { comptrollerLib },
    } = await provider.snapshot(snapshot);

    await expect(comptrollerLib.redeemSharesDetailed(BigNumber.from(0), [], [])).rejects.toBeRevertedWith(
      'Only delegate callable',
    );
  });
});
