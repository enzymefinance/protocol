import { GlobalConfigLib } from '@enzymefinance/protocol';
import { randomAddress } from '@enzymefinance/ethers';
import { assertEvent, ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const globalConfigProxy = fork.deployment.globalConfigProxy;

    expect(await globalConfigProxy.getGlobalConfigLib()).toMatchAddress(fork.deployment.globalConfigLib);
    expect(await globalConfigProxy.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
  });
});

describe('core', () => {
  describe('init', () => {
    it('cannot be called', async () => {
      await expect(fork.deployment.globalConfigProxy.init(randomAddress())).rejects.toBeRevertedWith(
        'Proxy already initialized',
      );
    });
  });

  describe('setGlobalConfigLib', () => {
    it('does not allow a random caller', async () => {
      const [randomUser] = fork.accounts;

      await expect(
        fork.deployment.globalConfigProxy.connect(randomUser).setGlobalConfigLib(randomAddress()),
      ).rejects.toBeRevertedWith('Only the Dispatcher owner can call this function');
    });

    // TODO: can mock a contract with a valid proxiableUUID() function but an incorrect uuid
    it('does not allow an invalid lib address', async () => {
      await expect(fork.deployment.globalConfigProxy.setGlobalConfigLib(randomAddress())).rejects.toBeReverted();
    });

    it('correctly updates the lib address and emits an event', async () => {
      const globalConfigProxy = fork.deployment.globalConfigProxy;

      // Set a new GlobalConfigLib
      const nextGlobalConfigLib = await GlobalConfigLib.deploy(fork.deployer);
      const setGlobalConfigLibTx = await globalConfigProxy.setGlobalConfigLib(nextGlobalConfigLib);

      // Assert the state updated correctly
      expect(await globalConfigProxy.getGlobalConfigLib()).toMatchAddress(nextGlobalConfigLib);

      // Assert the correct event was emitted
      assertEvent(setGlobalConfigLibTx, 'GlobalConfigLibSet', { nextGlobalConfigLib });
    });
  });
});
