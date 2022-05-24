import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { UintListRegistry } from '@enzymefinance/protocol';
import { AddressListUpdateType } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

const randomAddress1 = randomAddress();
const randomNumber1 = BigNumber.from(123);
const randomNumber2 = BigNumber.from(234);
const randomNumber3 = BigNumber.from(456);
const randomNumber4 = BigNumber.from(567);
const randomNumber5 = BigNumber.from(789);

let fork: ProtocolDeployment;
let uintListRegistry: UintListRegistry;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  uintListRegistry = fork.deployment.uintListRegistry;
});

describe('constructor', () => {
  it('sets state vars', async () => {
    expect(await uintListRegistry.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
  });
});

describe('addToList', () => {
  const itemsToAdd = [randomNumber1, randomNumber2];
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    [owner, randomUser] = fork.accounts;

    listId = await uintListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await expect(uintListRegistry.connect(randomUser).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );
  });

  it('allows a list owned by Dispatcher to be updated by Dispatcher owner', async () => {
    await uintListRegistry.createList(fork.deployment.dispatcher, AddressListUpdateType.AddAndRemove, []);

    // Calling the tx from a random user should fail
    await expect(uintListRegistry.connect(randomUser).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );

    // Calling the tx from the Dispatcher owner should succeed
    await uintListRegistry.addToList(listId, itemsToAdd);
  });

  it('does not allow UpdateType.None', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.None, []);

    await expect(uintListRegistry.connect(owner).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Cannot add to list',
    );
  });

  it('does not allow UpdateType.RemoveOnly', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await expect(uintListRegistry.connect(owner).addToList(listId, itemsToAdd)).rejects.toBeRevertedWith(
      'Cannot add to list',
    );
  });

  it('happy path: UpdateType.AddOnly', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    for (const item of itemsToAdd) {
      expect(await uintListRegistry.isInList(listId, item)).toBe(false);
    }

    const receipt = await uintListRegistry.connect(owner).addToList(listId, itemsToAdd);

    // Assert state
    for (const item of itemsToAdd) {
      expect(await uintListRegistry.isInList(listId, item)).toBe(true);
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
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await uintListRegistry.connect(owner).addToList(listId, itemsToAdd);

    // State and events tested above
  });
});

describe('createList', () => {
  it('happy path', async () => {
    const [creator] = fork.accounts;
    const owner = randomAddress1;
    const updateType = AddressListUpdateType.AddOnly;
    const initialItems = [randomNumber1, randomNumber2];

    const expectedListId = await uintListRegistry.getListCount();

    const receipt = await uintListRegistry.connect(creator).createList(owner, updateType, initialItems);

    // Assert state
    expect(await uintListRegistry.getListOwner(expectedListId)).toMatchAddress(owner);
    expect(await uintListRegistry.getListUpdateType(expectedListId)).toMatchFunctionOutput(
      uintListRegistry.getListUpdateType,
      updateType,
    );

    for (const item of initialItems) {
      expect(await uintListRegistry.isInList(expectedListId, item)).toBe(true);
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
  const itemsToRemove = [randomNumber1, randomNumber2];
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    [owner, randomUser] = fork.accounts;

    listId = await uintListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, itemsToRemove);

    await expect(uintListRegistry.connect(randomUser).removeFromList(listId, itemsToRemove)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );
  });

  it('does not allow UpdateType.None', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.None, itemsToRemove);

    await expect(uintListRegistry.connect(owner).removeFromList(listId, itemsToRemove)).rejects.toBeRevertedWith(
      'Cannot remove from list',
    );
  });

  it('does not allow UpdateType.AddOnly', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddOnly, itemsToRemove);

    await expect(uintListRegistry.connect(owner).removeFromList(listId, itemsToRemove)).rejects.toBeRevertedWith(
      'Cannot remove from list',
    );
  });

  it('happy path: UpdateType.RemoveOnly', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, itemsToRemove);

    for (const item of itemsToRemove) {
      expect(await uintListRegistry.isInList(listId, item)).toBe(true);
    }

    const receipt = await uintListRegistry.connect(owner).removeFromList(listId, itemsToRemove);

    // Assert state
    for (const item of itemsToRemove) {
      expect(await uintListRegistry.isInList(listId, item)).toBe(false);
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
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, itemsToRemove);

    await uintListRegistry.connect(owner).removeFromList(listId, itemsToRemove);

    // State and events tested above
  });
});

describe('setListOwner', () => {
  const nextOwner = randomAddress1;
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    [owner, randomUser] = fork.accounts;

    listId = await uintListRegistry.getListCount();
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);
  });

  it('does not allow a random caller', async () => {
    await expect(uintListRegistry.connect(randomUser).setListOwner(listId, nextOwner)).rejects.toBeRevertedWith(
      'Only callable by list owner',
    );
  });

  it('happy path', async () => {
    const receipt = await uintListRegistry.connect(owner).setListOwner(listId, nextOwner);

    // Assert state
    expect(await uintListRegistry.getListOwner(listId)).toMatchAddress(nextOwner);

    // Assert event
    assertEvent(receipt, 'ListOwnerSet', {
      id: listId,
      nextOwner,
    });
  });
});

describe('setListUpdateType', () => {
  let owner: SignerWithAddress, randomUser: SignerWithAddress;
  let listId: BigNumber;

  beforeEach(async () => {
    [owner, randomUser] = fork.accounts;

    listId = await uintListRegistry.getListCount();
  });

  it('does not allow a random caller', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddAndRemove, []);

    await expect(
      uintListRegistry.connect(randomUser).setListUpdateType(listId, AddressListUpdateType.None),
    ).rejects.toBeRevertedWith('Only callable by list owner');
  });

  it('does not allow UpdateType.AddOnly to UpdateType.AddAndRemove', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    await expect(
      uintListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.AddAndRemove),
    ).rejects.toBeRevertedWith('_nextUpdateType not allowed');
  });

  it('does not allow UpdateType.RemoveOnly to UpdateType.AddAndRemove', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await expect(
      uintListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.AddAndRemove),
    ).rejects.toBeRevertedWith('_nextUpdateType not allowed');
  });

  it('happy path: AddAndRemove to AddOnly', async () => {
    const prevUpdateType = AddressListUpdateType.AddAndRemove;
    const nextUpdateType = AddressListUpdateType.AddOnly;

    await uintListRegistry.createList(owner, prevUpdateType, []);

    const receipt = await uintListRegistry.connect(owner).setListUpdateType(listId, nextUpdateType);

    // Assert state
    expect(await uintListRegistry.getListUpdateType(listId)).toMatchFunctionOutput(
      uintListRegistry.getListUpdateType,
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
    await uintListRegistry.createList(owner, AddressListUpdateType.AddOnly, []);

    await uintListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.None);

    // State and events tested above
  });

  it('happy path: RemoveOnly to None', async () => {
    await uintListRegistry.createList(owner, AddressListUpdateType.RemoveOnly, []);

    await uintListRegistry.connect(owner).setListUpdateType(listId, AddressListUpdateType.None);

    // State and events tested above
  });
});

describe('list search', () => {
  it('works', async () => {
    // Define lists
    const itemInNoLists = randomNumber1;
    const itemInList1Only = randomNumber2;
    const itemInList2Only = randomNumber3;
    const itemInAllLists1 = randomNumber4;
    const itemInAllLists2 = randomNumber5;

    const list1 = [itemInList1Only, itemInAllLists1, itemInAllLists2];
    const list2 = [itemInList2Only, itemInAllLists1, itemInAllLists2];
    const emptyList = [] as BigNumber[];

    const list1Id = await uintListRegistry.getListCount();
    const list2Id = list1Id.add(1);
    const emptyListId = list2Id.add(1);

    // Create lists
    await uintListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, list1);
    await uintListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, list2);
    await uintListRegistry.createList(constants.AddressZero, AddressListUpdateType.None, emptyList);

    // Single item, multiple lists

    // isInAllLists()
    expect(await uintListRegistry.isInAllLists([list1Id, list2Id], itemInNoLists)).toBe(false);
    expect(await uintListRegistry.isInAllLists([list1Id, list2Id], itemInList1Only)).toBe(false);
    expect(await uintListRegistry.isInAllLists([list1Id, list2Id, emptyListId], itemInAllLists1)).toBe(false);

    expect(await uintListRegistry.isInAllLists([list1Id, list2Id], itemInAllLists1)).toBe(true);

    // isInSomeOfLists()
    expect(await uintListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInNoLists)).toBe(false);

    expect(await uintListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInAllLists1)).toBe(true);
    expect(await uintListRegistry.isInSomeOfLists([list1Id, list2Id, emptyListId], itemInList1Only)).toBe(true);

    // Multiple items, single list

    // areAllInList()
    expect(await uintListRegistry.areAllInList(list1Id, [itemInList1Only, itemInAllLists1, itemInNoLists])).toBe(false);
    expect(await uintListRegistry.areAllInList(emptyListId, [itemInAllLists1])).toBe(false);

    expect(await uintListRegistry.areAllInList(list1Id, [itemInList1Only, itemInAllLists1])).toBe(true);

    // areAllNotInList()
    expect(await uintListRegistry.areAllNotInList(list1Id, [itemInNoLists, itemInAllLists1])).toBe(false);

    expect(await uintListRegistry.areAllNotInList(list1Id, [itemInNoLists, itemInList2Only])).toBe(true);
    expect(await uintListRegistry.areAllNotInList(emptyListId, [itemInAllLists1])).toBe(true);

    // Multiple items, multiple lists

    // areAllInAllLists()
    expect(await uintListRegistry.areAllInAllLists([list1Id, list2Id], [itemInAllLists1, itemInList1Only])).toBe(false);
    expect(await uintListRegistry.areAllInAllLists([list1Id, emptyListId], [itemInAllLists1])).toBe(false);

    expect(await uintListRegistry.areAllInAllLists([list1Id, list2Id], [itemInAllLists1, itemInAllLists2])).toBe(true);

    // areAllInSomeOfLists()
    expect(
      await uintListRegistry.areAllInSomeOfLists(
        [list1Id, list2Id, emptyListId],
        [itemInList1Only, itemInList2Only, itemInNoLists],
      ),
    ).toBe(false);

    expect(
      await uintListRegistry.areAllInSomeOfLists([list1Id, list2Id, emptyListId], [itemInList1Only, itemInList2Only]),
    ).toBe(true);

    // areAllNotInAnyOfLists()
    expect(await uintListRegistry.areAllNotInAnyOfLists([list1Id, list2Id], [itemInList2Only, itemInNoLists])).toBe(
      false,
    );

    expect(await uintListRegistry.areAllNotInAnyOfLists([list1Id, emptyListId], [itemInList2Only, itemInNoLists])).toBe(
      true,
    );
  });
});
