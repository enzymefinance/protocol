import { encodeFunctionSignature } from 'web3-eth-abi';
import { randomHex } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('maxPositions', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    mockSystem = await deployMockSystem();
    defaultTxOpts = { from: user, gas: 8000000 };

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.ORDER_TAKER,
      'takeOrder',
    );

    takeOrderSignatureBytes = encodeFunctionSignature(
      takeOrderSignature
    );
  });

  test('Create and get max', async () => {
    const positions = ['0', '125', '9999999999'];
    for (const n of positions) {
      const maxPositions = await deploy(CONTRACT_NAMES.MAX_POSITIONS, [n]);
      expect(await maxPositions.methods.maxPositions().call()).toEqual(n);
    }
  });

  test('Policy manager and mock accounting with maxPositions', async () => {
    const maxPositions = '3';
    const policy = await deploy(CONTRACT_NAMES.MAX_POSITIONS, [
      maxPositions
    ]);
    const nonQuoteAsset = randomHex(20);
    const quoteAsset = mockSystem.weth.options.address;
    await mockSystem.policyManager.methods
      .register(takeOrderSignatureBytes, policy.options.address)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setOwnedAssets([mockSystem.weth.options.address])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          takeOrderSignatureBytes,
          [EMPTY_ADDRESS, EMPTY_ADDRESS, quoteAsset, EMPTY_ADDRESS, EMPTY_ADDRESS],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();
    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          takeOrderSignatureBytes,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            nonQuoteAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();

    await mockSystem.accounting.methods
      .setOwnedAssets([
        nonQuoteAsset,
        randomHex(20),
        randomHex(20),
      ])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          takeOrderSignatureBytes,
          [EMPTY_ADDRESS, EMPTY_ADDRESS, quoteAsset, EMPTY_ADDRESS, EMPTY_ADDRESS],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();
    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          takeOrderSignatureBytes,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            nonQuoteAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();

    await mockSystem.accounting.methods
      .setOwnedAssets([
        nonQuoteAsset,
        randomHex(20),
        randomHex(20),
        randomHex(20),
      ])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          takeOrderSignatureBytes,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            randomHex(20),
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
