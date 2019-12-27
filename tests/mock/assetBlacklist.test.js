import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex, toChecksumAddress } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('assetBlacklist', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let assetArray;
  let makeOrderSignature, makeOrderSignatureBytes;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    makeOrderSignatureBytes = encodeFunctionSignature(
      makeOrderSignature
    );

    mockSystem = await deployMockSystem(
      {policyManagerContract: CONTRACT_NAMES.POLICY_MANAGER}
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

  test('Create blacklist', async () => {
    const blacklist = await deploy(
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [assetArray]
    );

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);
  });

  test('Add asset to blacklist', async () => {
    const blacklist = await deploy(
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

  test('Policy manager with blacklist', async () => {
    const blacklist = await deploy(
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
    ).rejects.toThrow('Rule evaluated to false: AssetBlacklist');
  });
});
