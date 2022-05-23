import type { SignerWithAddress } from '@enzymefinance/hardhat';
import { TestNominatedOwnerMixin } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let testNominatedOwnerMixin: TestNominatedOwnerMixin;
let nominatedOwner: SignerWithAddress, owner: SignerWithAddress, randomUser: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [owner, nominatedOwner, randomUser] = fork.accounts;

  testNominatedOwnerMixin = await TestNominatedOwnerMixin.deploy(fork.deployer);
});

describe('__setOwner', () => {
  it('happy path', async () => {
    const receipt = await testNominatedOwnerMixin.setOwner(owner);

    expect(await testNominatedOwnerMixin.getOwner()).toMatchAddress(owner);

    assertEvent(receipt, 'OwnerSet', { owner });
  });
});

describe('post-setup actions', () => {
  beforeEach(async () => {
    await testNominatedOwnerMixin.setOwner(owner);
  });

  describe('setNominatedOwner', () => {
    it('cannot be called by a random user', async () => {
      await expect(
        testNominatedOwnerMixin.connect(randomUser).setNominatedOwner(nominatedOwner),
      ).rejects.toBeRevertedWith('Unauthorized');
    });

    it('happy path', async () => {
      const receipt = await testNominatedOwnerMixin.connect(owner).setNominatedOwner(nominatedOwner);

      expect(await testNominatedOwnerMixin.getNominatedOwner()).toMatchAddress(nominatedOwner);

      // Old owner should still be the owner
      expect(await testNominatedOwnerMixin.getOwner()).toMatchAddress(owner);

      assertEvent(receipt, 'NominatedOwnerSet', { nominatedOwner });
    });
  });

  describe('claimOwnership', () => {
    beforeEach(async () => {
      await testNominatedOwnerMixin.connect(owner).setNominatedOwner(nominatedOwner);
    });

    it('cannot be called by the owner', async () => {
      await expect(testNominatedOwnerMixin.connect(owner).claimOwnership()).rejects.toBeRevertedWith('Unauthorized');
    });

    it('happy path', async () => {
      const receipt = await testNominatedOwnerMixin.connect(nominatedOwner).claimOwnership();

      expect(await testNominatedOwnerMixin.getOwner()).toMatchAddress(nominatedOwner);

      // Nominated owner should be reset
      expect(await testNominatedOwnerMixin.getNominatedOwner()).toMatchAddress(constants.AddressZero);

      assertEvent(receipt, 'OwnerSet', { owner: nominatedOwner });
    });
  });
});
