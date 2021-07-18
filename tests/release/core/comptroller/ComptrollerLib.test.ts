import { randomAddress } from '@enzymefinance/ethers';
import { ComptrollerLib, FundDeployer, ReleaseStatusTypes } from '@enzymefinance/protocol';
import { deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const comptrollerLib = fork.deployment.comptrollerLib;

    expect(await comptrollerLib.getAssetFinalityResolver()).toMatchAddress(fork.deployment.assetFinalityResolver);
    expect(await comptrollerLib.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
    expect(await comptrollerLib.getExternalPositionManager()).toMatchAddress(fork.deployment.externalPositionManager);
    expect(await comptrollerLib.getFeeManager()).toMatchAddress(fork.deployment.feeManager);
    expect(await comptrollerLib.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
    expect(await comptrollerLib.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);
    expect(await comptrollerLib.getMlnToken()).toMatchAddress(fork.config.primitives.mln);
    expect(await comptrollerLib.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);
    expect(await comptrollerLib.getPrimitivePriceFeed()).toMatchAddress(fork.deployment.chainlinkPriceFeed);
    expect(await comptrollerLib.getProtocolFeeReserve()).toMatchAddress(fork.deployment.protocolFeeReserveProxy);
    expect(await comptrollerLib.getValueInterpreter()).toMatchAddress(fork.deployment.valueInterpreter);
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
