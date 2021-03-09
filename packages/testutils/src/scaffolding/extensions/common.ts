import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib } from '@enzymefinance/protocol';
import { BigNumberish, BytesLike } from 'ethers';

export async function callOnExtension({
  comptrollerProxy,
  extension,
  actionId,
  callArgs = '0x',
  signer,
}: {
  comptrollerProxy: ComptrollerLib;
  extension: AddressLike;
  actionId: BigNumberish;
  callArgs?: BytesLike;
  signer?: SignerWithAddress;
}) {
  let callOnExtensionTx: any;

  if (signer) {
    callOnExtensionTx = comptrollerProxy.connect(signer).callOnExtension(extension, actionId, callArgs);
  } else {
    callOnExtensionTx = comptrollerProxy.callOnExtension(extension, actionId, callArgs);
  }

  await expect(callOnExtensionTx).resolves.toBeReceipt();

  return callOnExtensionTx;
}
