import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex, toChecksumAddress } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('assetWhitelist', () => {
  let user, defaultTxOpts;
  let assetArray;
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    assetArray = [
      randomHex(20),
      randomHex(20),
      randomHex(20),
      randomHex(20),
      randomHex(20),
    ].map(addr => toChecksumAddress(addr));

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );

    takeOrderSignatureBytes = encodeFunctionSignature(
      takeOrderSignature
    );
  });

  test('Create whitelist', async () => {
    const whitelist = await deploy(CONTRACT_NAMES.ASSET_WHITELIST, [
      assetArray
    ]);

    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray
    );
  });

  test('Remove asset from whitelist', async () => {
    const whitelist = await deploy(CONTRACT_NAMES.ASSET_WHITELIST, [
      assetArray
    ]);
    const mockAsset = randomHex(20);

    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(mockAsset)
        .send(defaultTxOpts),
    ).rejects.toThrow('Asset not in whitelist');
    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(assetArray[0])
        .send(defaultTxOpts),
    ).resolves.not.toThrow();
    expect(await whitelist.methods.isMember(assetArray[0]).call()).toBe(
      false,
    );
  });

  test('Policy manager with whitelist', async () => {
    const contracts = await deployMockSystem({
      policyManagerContract: CONTRACT_NAMES.POLICY_MANAGER
    });
    const whitelist = await deploy(CONTRACT_NAMES.ASSET_WHITELIST, [
      assetArray,
    ]);
    const asset = assetArray[1];
    await contracts.policyManager.methods
      .register(takeOrderSignatureBytes, whitelist.options.address)
      .send(defaultTxOpts);

    const validateArgs = [
      takeOrderSignatureBytes,
      [EMPTY_ADDRESS, EMPTY_ADDRESS, asset, EMPTY_ADDRESS, EMPTY_ADDRESS],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).resolves.not.toThrow();

    await whitelist.methods
      .removeFromWhitelist(asset)
      .send(defaultTxOpts);

    expect(await whitelist.methods.isMember(asset).call()).toBe(false);
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false: AssetWhitelist');
  });
});
