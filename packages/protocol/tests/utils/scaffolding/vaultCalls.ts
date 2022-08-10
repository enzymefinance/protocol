import type { AddressLike } from '@enzymefinance/ethers';
import type { AddressListRegistry, AddressListUpdateType, ComptrollerLib } from '@enzymefinance/protocol';
import {
  addressListRegistryCreateListSelector,
  curveMinterMintManySelector,
  curveMinterMintSelector,
  curveMinterToggleApproveMintSelector,
  encodeArgs,
  sighash,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

export async function vaultCallCreateNewList({
  addressListRegistry,
  comptrollerProxy,
  items,
  owner,
  signer,
  updateType,
}: {
  addressListRegistry: AddressListRegistry;
  comptrollerProxy: ComptrollerLib;
  items: AddressLike[];
  owner: AddressLike;
  signer: SignerWithAddress;
  updateType: AddressListUpdateType;
}) {
  await comptrollerProxy
    .connect(signer)
    .vaultCallOnContract(
      addressListRegistry.address,
      addressListRegistryCreateListSelector,
      encodeArgs(['address', 'uint8', 'address[]'], [owner, updateType, items]),
    );

  const listCount = await addressListRegistry.getListCount();

  return listCount.sub(1);
}

export function vaultCallCurveMinterMint({
  comptrollerProxy,
  minter,
  gauge,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauge: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(minter, curveMinterMintSelector, encodeArgs(['address'], [gauge]));
}

export function vaultCallCurveMinterMintMany({
  comptrollerProxy,
  minter,
  gauges,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauges: AddressLike[];
}) {
  const gaugesFormatted = new Array(8).fill(constants.AddressZero);

  for (const i in gauges) {
    gaugesFormatted[i] = gauges[i];
  }

  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterMintManySelector,
    encodeArgs(['address[8]'], [gaugesFormatted]),
  );
}

export function vaultCallCurveMinterToggleApproveMint({
  comptrollerProxy,
  minter,
  account,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  account: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterToggleApproveMintSelector,
    encodeArgs(['address'], [account]),
  );
}

export function vaultCallStartAssetBypassTimelock({
  comptrollerProxy,
  contract,
  asset,
}: {
  comptrollerProxy: ComptrollerLib;
  contract: AddressLike;
  asset: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(
    contract,
    sighash(utils.FunctionFragment.fromString('startAssetBypassTimelock(address)')),
    encodeArgs(['address'], [asset]),
  );
}
