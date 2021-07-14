import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { encodeFunctionData, ProtocolFeeReserveLib, ProtocolFeeReserveProxy } from '@enzymefinance/protocol';
import { assertEvent, ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';

async function createProtocolFeeReserveProxy({
  signer,
  protocolFeeReserveLib,
  dispatcher,
}: {
  signer: SignerWithAddress;
  protocolFeeReserveLib: ProtocolFeeReserveLib;
  dispatcher: AddressLike;
}) {
  const constructData = encodeFunctionData(protocolFeeReserveLib.init.fragment, [dispatcher]);

  const protocolFeeReserveProxyContract = await ProtocolFeeReserveProxy.deploy(
    signer,
    constructData,
    protocolFeeReserveLib,
  );

  return {
    protocolFeeReserveProxy: new ProtocolFeeReserveLib(protocolFeeReserveProxyContract, signer),
    receipt: protocolFeeReserveProxyContract.deployment!,
  };
}

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('ProtocolFeeReserveLibBaseCore', () => {
  describe('init', () => {
    const dispatcherAddress = randomAddress();

    it('can only be called once', async () => {
      const { protocolFeeReserveProxy } = await createProtocolFeeReserveProxy({
        signer: fork.deployer,
        protocolFeeReserveLib: fork.deployment.protocolFeeReserveLib,
        dispatcher: dispatcherAddress,
      });

      // Should fail calling init() directly as it has already been called during deployment
      await expect(protocolFeeReserveProxy.init(dispatcherAddress)).rejects.toBeRevertedWith(
        'Proxy already initialized',
      );
    });

    it('happy path', async () => {
      const protocolFeeReserveLib = fork.deployment.protocolFeeReserveLib;

      const { receipt, protocolFeeReserveProxy } = await createProtocolFeeReserveProxy({
        signer: fork.deployer,
        protocolFeeReserveLib,
        dispatcher: dispatcherAddress,
      });

      expect(await protocolFeeReserveProxy.getDispatcher()).toMatchAddress(dispatcherAddress);

      assertEvent(receipt, protocolFeeReserveLib.abi.getEvent('ProtocolFeeReserveLibSet'), {
        nextProtocolFeeReserveLib: protocolFeeReserveLib,
      });
    });
  });

  describe('setProtocolFeeReserveLib', () => {
    let nextProtocolFeeReserveLib: ProtocolFeeReserveLib;
    let protocolFeeReserveProxy: ProtocolFeeReserveLib;

    beforeEach(async () => {
      protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;

      nextProtocolFeeReserveLib = await ProtocolFeeReserveLib.deploy(fork.deployer);
    });

    it('cannot be called by a random user', async () => {
      const [randomUser] = fork.accounts;

      await expect(
        protocolFeeReserveProxy.connect(randomUser).setProtocolFeeReserveLib(nextProtocolFeeReserveLib),
      ).rejects.toBeRevertedWith('Only the Dispatcher owner can call this function');
    });

    it('happy path', async () => {
      const receipt = await protocolFeeReserveProxy.setProtocolFeeReserveLib(nextProtocolFeeReserveLib);

      expect(await protocolFeeReserveProxy.getProtocolFeeReserveLib()).toMatchAddress(nextProtocolFeeReserveLib);

      assertEvent(receipt, 'ProtocolFeeReserveLibSet', {
        nextProtocolFeeReserveLib,
      });
    });
  });
});
