import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/new/constants';
import { randomHex, toChecksumAddress } from 'web3-utils';
import { getFunctionSignature } from '~/tests/utils/new/metadata';
import { encodeFunctionSignature } from 'web3-eth-abi';

describe('assetBlacklist', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;
  let assetArray;
  let makeOrderSignature, makeOrderSignatureBytes;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    makeOrderSignatureBytes = encodeFunctionSignature(
      makeOrderSignature
    );

    mockSystem = await deployMockSystem(
      environment,
      { policyManagerContract: CONTRACT_NAMES.POLICY_MANAGER }
    );

    // Define shared vars
    assetArray = [
      randomHex(20),
      randomHex(20),
      randomHex(20),
      randomHex(20),
      randomHex(20),
    ].map(addr => toChecksumAddress(addr));
  });

  it('Create blacklist', async () => {
    const blacklist = await deploy(
      environment,
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [assetArray]
    );

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);
  });

  it('Add asset to blacklist', async () => {
    const blacklist = await deploy(
      environment,
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [assetArray]
    );
    const mockAsset = randomHex(20);

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);

    await expect(
      blacklist.methods.addToBlacklist(assetArray[0]).send(defaultTxOpts)
    ).rejects.toThrow('Asset already in blacklist');

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);

    await expect(
      blacklist.methods.addToBlacklist(mockAsset).send(defaultTxOpts)
    ).resolves.not.toThrow();

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);
  });

  it('Policy manager with blacklist', async () => {
    const blacklist = await deploy(
      environment,
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [assetArray]
    );
    const mockAsset = randomHex(20);

    await mockSystem.policyManager.methods
      .register(makeOrderSignatureBytes, blacklist.options.address)
      .send(defaultTxOpts);

    const validateArgs = [
      makeOrderSignatureBytes,
      [EMPTY_ADDRESS, EMPTY_ADDRESS, EMPTY_ADDRESS, mockAsset, EMPTY_ADDRESS],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      mockSystem.policyManager.methods.preValidate(...validateArgs).call()
    ).resolves.not.toThrow();

    await blacklist.methods.addToBlacklist(mockAsset).send(defaultTxOpts);

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);

    await expect(
      mockSystem.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
