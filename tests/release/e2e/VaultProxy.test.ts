import { SignerWithAddress } from '@enzymefinance/hardhat';
import { randomAddress } from '@enzymefinance/ethers';
import { StandardToken } from '@enzymefinance/protocol';
import { assertEvent, createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.connect(randomUser).setNominatedOwner(randomAddress())).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(constants.AddressZero)).rejects.toBeRevertedWith(
      '_nextNominatedOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(fundOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already the owner',
    );
  });

  it('does not allow the next owner to already be nominated', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwner = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwner);

    // Attempt to nominate the same nextOwner a second time
    await expect(vaultProxy.setNominatedOwner(nextOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwnerAddress = randomAddress();
    const receipt = await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // NominatedOwnerSet event properly emitted
    assertEvent(receipt, 'NominatedOwnerSet', {
      nominatedOwner: nextOwnerAddress,
    });

    // New owner should have been nominated
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(nextOwnerAddress);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('removeNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to remove nominated owner should fail
    await expect(vaultProxy.connect(randomUser).removeNominatedOwner()).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('correctly handles removing the nomination', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    const nextOwnerAddress = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // Attempt by a random user to remove nominated owner should fail
    const receipt = await vaultProxy.removeNominatedOwner();

    // NominatedOwnerRemoved event properly emitted
    assertEvent(receipt, 'NominatedOwnerRemoved', {
      nominatedOwner: nextOwnerAddress,
    });

    // Nomination should have been removed
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('claimOwnership', () => {
  it('can only be called by the nominatedOwner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to claim ownership should fail
    await expect(vaultProxy.connect(randomUser).claimOwnership()).rejects.toBeRevertedWith(
      'Only the nominatedOwner can call this function',
    );
  });

  it('correctly handles transferring ownership', async () => {
    const [fundOwner, nominatedOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(nominatedOwner);

    // Claim ownership
    const receipt = await vaultProxy.connect(nominatedOwner).claimOwnership();

    // OwnershipTransferred event properly emitted
    assertEvent(receipt, 'OwnershipTransferred', {
      prevOwner: fundOwner,
      nextOwner: nominatedOwner,
    });

    // Owner should now be the nominatedOwner
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(nominatedOwner);

    // nominatedOwner should be empty
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);
  });
});
