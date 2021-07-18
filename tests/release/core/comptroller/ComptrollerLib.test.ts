import { randomAddress } from '@enzymefinance/ethers';
import { ComptrollerLib, FundDeployer, ReleaseStatusTypes } from '@enzymefinance/protocol';
import { deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      assetFinalityResolver,
      chainlinkPriceFeed,
      comptrollerLib,
      dispatcher,
      feeManager,
      fundDeployer,
      integrationManager,
      policyManager,
      protocolFeeReserveProxy,
      valueInterpreter,
    } = fork.deployment;

    const routesCall = await comptrollerLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(comptrollerLib.getLibRoutes, {
      assetFinalityResolver_: assetFinalityResolver,
      dispatcher_: dispatcher,
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      integrationManager_: integrationManager,
      policyManager_: policyManager,
      primitivePriceFeed_: chainlinkPriceFeed,
      protocolFeeReserve_: protocolFeeReserveProxy,
      valueInterpreter_: valueInterpreter,
    });

    expect(await comptrollerLib.getMlnToken()).toMatchAddress(fork.config.primitives.mln);
  });
});

describe('destruct calls', () => {
  it('cannot be non-delegatecalled', async () => {
    const mockFundDeployer = await FundDeployer.mock(fork.deployer);
    await mockFundDeployer.getReleaseStatus.returns(ReleaseStatusTypes.Live);

    const comptrollerLib = await ComptrollerLib.deploy(
      fork.deployer,
      randomAddress(),
      randomAddress(),
      mockFundDeployer,
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
    );

    // Calling the ComptrollerLib directly should fail for a destruct call
    await expect(mockFundDeployer.forward(comptrollerLib.destructUnactivated)).rejects.toBeRevertedWith(
      'Only delegate callable',
    );
  });
});
