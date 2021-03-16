import { randomAddress } from '@enzymefinance/ethers';
import { ReleaseStatusTypes } from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state', async () => {
    const { fundDeployer, vaultLib, dispatcher } = fork.deployment;

    const getCreatorCall = await fundDeployer.getCreator();
    expect(getCreatorCall).toMatchAddress(fork.deployer);

    const getDispatcherCall = await fundDeployer.getDispatcher();
    expect(getDispatcherCall).toMatchAddress(dispatcher);

    const getOwnerCall = await fundDeployer.getOwner();
    expect(getOwnerCall).toMatchAddress(fork.deployer);

    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.Live);

    const getVaultLibCall = await fundDeployer.getVaultLib();
    expect(getVaultLibCall).toMatchAddress(vaultLib);

    for (const [contract, selector] of fork.config.vaultCalls) {
      const isRegisteredVaultCallCall = await fundDeployer.isRegisteredVaultCall(contract, selector);

      expect(isRegisteredVaultCallCall).toBe(true);
    }
  });
});

describe('setComptrollerLib', () => {
  it.todo('emits ControllerLibSet event');

  it('is set during deployment and can only be set once', async () => {
    const { fundDeployer, comptrollerLib } = fork.deployment;

    const comptrollerLibCall = await fundDeployer.getComptrollerLib();
    expect(comptrollerLibCall).toMatchAddress(comptrollerLib);

    await expect(fundDeployer.setComptrollerLib(randomAddress())).rejects.toBeRevertedWith(
      'This value can only be set once',
    );
  });
});

describe('setReleaseStatus', () => {
  it.todo('can only be called by the Dispatcher contract owner');

  it.todo('does not allow returning to PreLaunch status');

  it.todo('does not allow the current status');

  it.todo('can only be called when a comptroller lib is set');

  it('correctly handles setting the release status', async () => {
    const { fundDeployer } = fork.deployment;
    const receipt = await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    // ReleaseStatusSet event is emitted
    assertEvent(receipt, 'ReleaseStatusSet', {
      prevStatus: ReleaseStatusTypes.Live,
      nextStatus: ReleaseStatusTypes.Paused,
    });

    // Release Status should be Paused
    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.Paused);
  });
});

describe('getOwner', () => {
  it.todo('write tests for special ownership conditions of this contract');
});

describe('deregisterVaultCalls', () => {
  it.todo('write tests');
});

describe('registerVaultCalls', () => {
  it.todo('write tests');
});
