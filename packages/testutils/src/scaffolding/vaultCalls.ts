import { AddressLike } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  curveMinterMintManySelector,
  curveMinterMintSelector,
  curveMinterToggleApproveMintSelector,
  encodeArgs,
  sighash,
} from '@enzymefinance/protocol';
import { constants, utils } from 'ethers';

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
