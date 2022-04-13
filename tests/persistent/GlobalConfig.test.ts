import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  encodeArgs,
  GlobalConfigLib,
  ONE_HUNDRED_PERCENT_IN_BPS,
  sighash,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BytesLike } from 'ethers';
import { constants, utils } from 'ethers';

const noValidationDummyAddress = '0x000000000000000000000000000000000000aaaa';
const noValidationDummyAmount = constants.MaxUint256.sub(1);
const randomAddressValue = randomAddress();
const randomSelector = utils.randomBytes(4);
let fork: ProtocolDeployment;
let globalConfigProxy: GlobalConfigLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  globalConfigProxy = fork.deployment.globalConfigProxy;
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    expect(await globalConfigProxy.getGlobalConfigLib()).toMatchAddress(fork.deployment.globalConfigLib);
    expect(await globalConfigProxy.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
  });
});

describe('core', () => {
  describe('init', () => {
    it('cannot be called', async () => {
      await expect(globalConfigProxy.init(randomAddressValue)).rejects.toBeRevertedWith('Proxy already initialized');
    });
  });

  describe('setGlobalConfigLib', () => {
    it('does not allow a random caller', async () => {
      const [randomUser] = fork.accounts;

      await expect(
        globalConfigProxy.connect(randomUser).setGlobalConfigLib(randomAddressValue),
      ).rejects.toBeRevertedWith('Only the Dispatcher owner can call this function');
    });

    // TODO: can mock a contract with a valid proxiableUUID() function but an incorrect uuid
    it('does not allow an invalid lib address', async () => {
      await expect(globalConfigProxy.setGlobalConfigLib(randomAddressValue)).rejects.toBeReverted();
    });

    it('correctly updates the lib address and emits an event', async () => {
      // Set a new GlobalConfigLib
      const nextGlobalConfigLib = await GlobalConfigLib.deploy(fork.deployer, randomAddressValue);
      const setGlobalConfigLibTx = await globalConfigProxy.setGlobalConfigLib(nextGlobalConfigLib);

      // Assert the state updated correctly
      expect(await globalConfigProxy.getGlobalConfigLib()).toMatchAddress(nextGlobalConfigLib);

      // Assert the correct event was emitted
      assertEvent(setGlobalConfigLibTx, 'GlobalConfigLibSet', { nextGlobalConfigLib });
    });
  });
});

describe('isValidRedeemSharesCall', () => {
  it('returns false: invalid vault', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const validSighash = sighash(comptrollerProxy.redeemSharesInKind.fragment);

    expect(
      await globalConfigProxy.isValidRedeemSharesCall(
        randomAddressValue, // invalid
        noValidationDummyAddress,
        noValidationDummyAmount,
        comptrollerProxy,
        validSighash,
        '0x',
      ),
    ).toBe(false);
  });

  describe('v4', () => {
    const validRecipient = randomAddressValue;
    const validSharesAmount = 123;
    let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

    beforeEach(async () => {
      const [fundOwner] = fork.accounts;
      const newFundRes = await createNewFund({
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      comptrollerProxy = newFundRes.comptrollerProxy;
      vaultProxy = newFundRes.vaultProxy;
    });

    it('returns false: incorrect redemption contract', async () => {
      const redeemSharesInKindFragment = comptrollerProxy.redeemSharesInKind.fragment;
      const redeemSharesInKindSighash = sighash(comptrollerProxy.redeemSharesInKind.fragment);
      const redeemSharesInKindData = encodeArgs(redeemSharesInKindFragment.inputs, [
        validRecipient,
        validSharesAmount,
        [],
        [],
      ]);

      expect(
        await globalConfigProxy.isValidRedeemSharesCall(
          vaultProxy,
          noValidationDummyAddress,
          noValidationDummyAmount,
          randomAddressValue, // invalid
          redeemSharesInKindSighash,
          redeemSharesInKindData,
        ),
      ).toBe(false);
    });

    it('returns false: incorrect selector', async () => {
      const redeemSharesInKindFragment = comptrollerProxy.redeemSharesInKind.fragment;
      const redeemSharesInKindData = encodeArgs(redeemSharesInKindFragment.inputs, [
        validRecipient,
        validSharesAmount,
        [],
        [],
      ]);

      expect(
        await globalConfigProxy.isValidRedeemSharesCall(
          vaultProxy,
          noValidationDummyAddress,
          noValidationDummyAmount,
          comptrollerProxy,
          randomSelector, // invalid
          redeemSharesInKindData,
        ),
      ).toBe(false);
    });

    describe('inKind', () => {
      let redeemFunctionFragment: utils.FunctionFragment, redeemSelector: BytesLike, redeemData: BytesLike;

      beforeEach(async () => {
        redeemFunctionFragment = comptrollerProxy.redeemSharesInKind.fragment;
        redeemSelector = sighash(redeemFunctionFragment);
        redeemData = encodeArgs(redeemFunctionFragment.inputs, [randomAddressValue, validSharesAmount, [], []]);
      });

      it('returns true: no recipient or shares validations', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            noValidationDummyAddress,
            noValidationDummyAmount,
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(true);
      });

      // shares validation

      it('returns false: shares amount mismatch', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            noValidationDummyAddress,
            validSharesAmount + 1, // invalid
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(false);
      });

      it('returns true: valid shares amount', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            noValidationDummyAddress,
            validSharesAmount,
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(true);
      });

      // recipient validation

      it('returns false: recipient mismatch', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            constants.AddressZero, // invalid
            noValidationDummyAmount,
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(false);
      });

      it('returns true: valid recipient', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            validRecipient,
            noValidationDummyAmount,
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(true);
      });
    });

    describe('specificAssets', () => {
      let redeemFunctionFragment: utils.FunctionFragment, redeemSelector: BytesLike, redeemData: BytesLike;

      beforeEach(async () => {
        redeemFunctionFragment = comptrollerProxy.redeemSharesForSpecificAssets.fragment;
        redeemSelector = sighash(redeemFunctionFragment);
        redeemData = encodeArgs(redeemFunctionFragment.inputs, [
          randomAddressValue,
          validSharesAmount,
          [randomAddressValue],
          [ONE_HUNDRED_PERCENT_IN_BPS],
        ]);
      });

      // Other validations tested above, just want to confirm data is parsed correctly
      it('returns true: valid shares recipient and amount', async () => {
        expect(
          await globalConfigProxy.isValidRedeemSharesCall(
            vaultProxy,
            validRecipient,
            validSharesAmount,
            comptrollerProxy,
            redeemSelector,
            redeemData,
          ),
        ).toBe(true);
      });
    });
  });
});
