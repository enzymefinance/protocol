import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { AddressListRegistry } from '@enzymefinance/protocol';
import { AddressListUpdateType } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    expect(await fork.deployment.addressListRegistry.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
  });
});

describe('addToList', () => {
  const itemsToAdd = [randomAddress(), randomAddress()];
  let addressListRegistry: AddressListRegistry;
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    addressListRegistry = fork.deployment.addressListRegistry;

    [owner, randomUser] = fork.accounts;

    listId = await addressListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await expect(addressListRegistry.connect(randomUser).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );
  });

  it('allows a list owned by Dispatcher to be updated by Dispatcher owner', async () => {
    await addressListRegistry.createList(fork.deployment.dispatcher, AddressListUpdateType.AddAndRemove, []);

    // Calling the tx from a random user should fail
    await expect(addressListRegistry.connect(randomUser).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );

    // Calling the tx from the Dispatcher owner should succeed
    await addressListRegistry.addToList(listId, itemsToAdd);
  });

  it('does not allow UpdateType.None', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.None, []);

    await expect(addressListRegistry.connect(owner).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Cannot add to list',
    );
  });

  it('does not allow UpdateType.RemoveOnly', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await expect(addressListRegistry.connect(owner).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Cannot add to list',
    );
  });

  it('happy path: UpdateType.AddOnly', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    for (const item of itemsToAdd) {
      expect(await addressListRegistry.isInList(listId, item)).toBe(false);
    }

    const receipt = await addressListRegistry.connect(owner).addToList(listId, itemsToAdd);

    // Assert state
    for (const item of itemsToAdd) {
      expect(await addressListRegistry.isInList(listId, item)).toBe(true);
    }

    // Assert events
    const events = extractEvent(receipt, 'ItemAddedToList');

    expect(events.length).toBe(itemsToAdd.length);

    for (const i in itemsToAdd) {
      expect(events[i].args).toMatchObject({
        id: listId,
        item: itemsToAdd[i],
      });
    }
  });

  it('happy path: UpdateType.AddAndRemove', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await addressListRegistry.connect(owner).addToList(listId, itemsToAdd);

    // State and events tested above
  });
});

describe('createList', () => {
  it('happy path', async () => {
    const addressListRegistry = fork.deployment.addressListRegistry;

    const [creator] = fork.accounts;
    const owner = randomAddress();
    const updateType = AddressListUpdateType.AddOnly;
    const initialItems = [randomAddress(), randomAddress()];

    const expectedListId = await addressListRegistry.getListCount();

    const receipt = await addressListRegistry.connect(creator).createList(owner, updateType, initialItems);

    // Assert state
    expect(await addressListRegistry.getListOwner(expectedListId)).toMatchAddress(owner);
    expect(await addressListRegistry.getListUpdateType(expectedListId)).toMatchFunctionOutput(
      addressListRegistry.getListUpdateType,
      updateType,
    );

    for (const item of initialItems) {
      expect(await addressListRegistry.isInList(expectedListId, item)).toBe(true);
    }

    // Assert event
    assertEvent(receipt, 'ListCreated', {
      creator,
      id: expectedListId,
      owner,
      updateType,
    });
  });
});

describe('removeFromList', () => {
  const itemsToRemove = [randomAddress(), randomAddress()];
  let addressListRegistry: AddressListRegistry;
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    addressListRegistry = fork.deployment.addressListRegistry;

    [owner, randomUser] = fork.accounts;

    listId = await addressListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, itemsToRemove);

    await expect(
      addressListRegistry.connect(randomUser).removeFromList(listId, itemsToRemove),
    ).rejects.toBeRevertedWith('Only callable by list owner');
  });

  it('does not allow UpdateType.None', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.None, itemsToRemove);

    await expect(addressListRegistry.connect(owner).removeFromList(listId, itemsToRemove)).rejects.toBeRevertedWith(
      'Cannot remove from list',
    );
  });

  it('does not allow UpdateType.AddOnly', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddOnly, itemsToRemove);

    await expect(addressListRegistry.connect(owner).removeFromList(listId, itemsToRemove)).rejects.toBeRevertedWith(
      'Cannot remove from list',
    );
  });

  it('happy path: UpdateType.RemoveOnly', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, itemsToRemove);

    for (const item of itemsToRemove) {
      expect(await addressListRegistry.isInList(listId, item)).toBe(true);
    }

    const receipt = await addressListRegistry.connect(owner).removeFromList(listId, itemsToRemove);

    // Assert state
    for (const item of itemsToRemove) {
      expect(await addressListRegistry.isInList(listId, item)).toBe(false);
    }

    // Assert events
    const events = extractEvent(receipt, 'ItemRemovedFromList');

    expect(events.length).toBe(itemsToRemove.length);

    for (const i in itemsToRemove) {
      expect(events[i].args).toMatchObject({
        id: listId,
        item: itemsToRemove[i],
      });
    }
  });

  it('happy path: UpdateType.AddAndRemove', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, itemsToRemove);

    await addressListRegistry.connect(owner).removeFromList(listId, itemsToRemove);

    // State and events tested above
  });
});

describe('setListOwner', () => {
  const nextOwner = randomAddress();
  let addressListRegistry: AddressListRegistry;
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    addressListRegistry = fork.deployment.addressListRegistry;

    [owner, randomUser] = fork.accounts;

    listId = await addressListRegistry.getListCount();
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);
  });

  it('does not allow a random caller', async () => {
    await expect(addressListRegistry.connect(randomUser).setListOwner(listId, nextOwner)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );
  });

  it('happy path', async () => {
    const receipt = await addressListRegistry.connect(owner).setListOwner(listId, nextOwner);

    // Assert state
    expect(await addressListRegistry.getListOwner(listId)).toMatchAddress(nextOwner);

    // Assert event
    assertEvent(receipt, 'ListOwnerSet', {
      id: listId,
      nextOwner,
    });
  });
});

describe('setListUpdateType', () => {
  let addressListRegistry: AddressListRegistry;
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    addressListRegistry = fork.deployment.addressListRegistry;

    [owner, randomUser] = fork.accounts;

    listId = await addressListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await expect(
      addressListRegistry.connect(randomUser).setListUpdateType(listId, AddressListUpdateType.None),
    ).rejects.toBeRevertedWith('Only callable by list owner');
  });

  it('does not allow UpdateType.AddOnly to UpdateType.AddAndRemove', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    await expect(
      addressListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.AddAndRemove),
    ).rejects.toBeRevertedWith('_nextUpdateType not allowed');
  });

  it('does not allow UpdateType.RemoveOnly to UpdateType.AddAndRemove', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await expect(
      addressListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.AddAndRemove),
    ).rejects.toBeRevertedWith('_nextUpdateType not allowed');
  });

  it('happy path: AddAndRemove to AddOnly', async () => {
    const prevUpdateType = AddressListUpdateType.AddAndRemove;
    const nextUpdateType = AddressListUpdateType.AddOnly;

    await addressListRegistry.createList(owner, prevUpdateType, []);

    const receipt = await addressListRegistry.connect(owner).setListUpdateType(listId, nextUpdateType);

    // Assert state
    expect(await addressListRegistry.getListUpdateType(listId)).toMatchFunctionOutput(
      addressListRegistry.getListUpdateType,
      AddressListUpdateType.AddOnly,
    );

    // Assert event
    assertEvent(receipt, 'ListUpdateTypeSet', {
      id: listId,
      nextUpdateType,
      prevUpdateType,
    });
  });

  it('happy path: AddOnly to None', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    await addressListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.None);

    // State and events tested above
  });

  it('happy path: RemoveOnly to None', async () => {
    await addressListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await addressListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.None);

    // State and events tested above
  });
});

describe('list search', () => {
  it('works', async () => {
    const addressListRegistry = fork.deployment.addressListRegistry;

    // Define lists
    const itemInNoLists = randomAddress();
    const itemInList1Only = randomAddress();
    const itemInList2Only = randomAddress();
    const itemInAllLists1 = randomAddress();
    const itemInAllLists2 = randomAddress();

    const list1 = [itemInList1Only, itemInAllLists1, itemInAllLists2];
    const list2 = [itemInList2Only, itemInAllLists1, itemInAllLists2];
    const emptyList = [] as AddressLike[];

    const list1Id = await addressListRegistry.getListCount();
    const list2Id = list1Id.add(1);
    const emptyListId = list2Id.add(1);

    // Create lists
    await addressListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, list1);
    await addressListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, list2);
    await addressListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, emptyList);

    // Single item, multiple lists

    // isInAllLists()
    expect(await addressListRegistry.isInAllLists([list1Id, list2Id], itemInNoLists)).toBe(false);
    expect(await addressListRegistry.isInAllLists([list1Id, list2Id], itemInList1Only)).toBe(false);
    expect(await addressListRegistry.isInAllLists([list1Id, list2Id, emptyListId], itemInAllLists1)).toBe(false);

    expect(await addressListRegistry.isInAllLists([list1Id, list2Id], itemInAllLists1)).toBe(true);

    // isInSomeOfLists()
    expect(await addressListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInNoLists)).toBe(false);

    expect(await addressListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInAllLists1)).toBe(true);
    expect(await addressListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInList1Only)).toBe(true);

    // Multiple items, single list

    // areAllInList()
    expect(await addressListRegistry.areAllInList(list1Id, [itemInList1Only, itemInAllLists1, itemInNoLists])).toBe(
      false,
    );
    expect(await addressListRegistry.areAllInList(emptyListId, [itemInAllLists1])).toBe(false);

    expect(await addressListRegistry.areAllInList(list1Id, [itemInList1Only, itemInAllLists1])).toBe(true);

    // areAllNotInList()
    expect(await addressListRegistry.areAllNotInList(list1Id, [itemInNoLists, itemInAllLists1])).toBe(false);

    expect(await addressListRegistry.areAllNotInList(list1Id, [itemInNoLists, itemInList2Only])).toBe(true);
    expect(await addressListRegistry.areAllNotInList(emptyListId, [itemInAllLists1])).toBe(true);

    // Multiple items, multiple lists

    // areAllInAllLists()
    expect(await addressListRegistry.areAllInAllLists([list1Id, list2Id], [itemInAllLists1, itemInList1Only])).toBe(
      false,
    );
    expect(await addressListRegistry.areAllInAllLists([list1Id, emptyListId], [itemInAllLists1])).toBe(false);

    expect(await addressListRegistry.areAllInAllLists([list1Id, list2Id], [itemInAllLists1, itemInAllLists2])).toBe(
      true,
    );

    // areAllInSomeOfLists()
    expect(
      await addressListRegistry.areAllInSomeOfLists(
        [list1Id, list2Id, emptyListId],
        [itemInList1Only, itemInList2Only, itemInNoLists],
      ),
    ).toBe(false);

    expect(
      await addressListRegistry.areAllInSomeOfLists(
        [list1Id, list2Id, emptyListId],
        [itemInList1Only, itemInList2Only],
      ),
    ).toBe(true);

    // areAllNotInAnyOfLists()
    expect(await addressListRegistry.areAllNotInAnyOfLists([list1Id, list2Id], [itemInList2Only, itemInNoLists])).toBe(
      false,
    );

    expect(
      await addressListRegistry.areAllNotInAnyOfLists([list1Id, emptyListId], [itemInList2Only, itemInNoLists]),
    ).toBe(true);
  });
});
