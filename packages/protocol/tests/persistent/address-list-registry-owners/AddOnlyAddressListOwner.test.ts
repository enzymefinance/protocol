import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { AddressListRegistry, ITestAddOnlyAddressListOwner } from '@enzymefinance/protocol';
import { AaveV2ATokenListOwner } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';

const invalidItem = randomAddress();
let fork: ProtocolDeployment;
let addressListRegistry: AddressListRegistry;
let listId: BigNumber, listOwner: ITestAddOnlyAddressListOwner;
let validItem: AddressLike;

// TODO: add Aave v3 when ready
const listKeys = ['aaveV2'];
describe.each(listKeys)('%s as list', (listKey) => {
  beforeEach(async () => {
    fork = await deployProtocolFixture();

    addressListRegistry = fork.deployment.addressListRegistry;

    listId = await addressListRegistry.getListCount();

    // list-specific vars
    // Deploy lists fresh so that no items are registered
    switch (listKey) {
      case 'aaveV2':
        validItem = fork.config.aaveV2.atokens.adai;
        listOwner = await AaveV2ATokenListOwner.deploy(
          fork.deployer,
          addressListRegistry,
          'Aave v2: aTokens',
          fork.config.aaveV2.lendingPoolAddressProvider,
        );
        break;
    }
  });

  describe('addValidatedItemsToList', () => {
    // TODO: really, we should use a mock of the valid token's interface so that this reverts closer
    // to the case that we actually want to test, i.e., the actual call to aave in the case of aTokens
    it('does not allow an invalid item', async () => {
      await expect(listOwner.addValidatedItemsToList([invalidItem])).rejects.toBeReverted();
    });

    it('happy path', async () => {
      // Item should initially be unregistered
      expect(await addressListRegistry.isInList(listId, validItem)).toBe(false);

      const receipt = await listOwner.addValidatedItemsToList([validItem]);

      // Item should be registered
      expect(await addressListRegistry.isInList(listId, validItem)).toBe(true);

      expect(receipt).toMatchGasSnapshot(listKey);
    });
  });
});
