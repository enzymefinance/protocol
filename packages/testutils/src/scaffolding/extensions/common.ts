import { AddressLike, SignerWithAddress } from '@crestproject/crestproject';
import { BigNumberish, BytesLike } from 'ethers';
import { ComptrollerLib } from '@melonproject/protocol';

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
    callOnExtensionTx = comptrollerProxy
      .connect(signer)
      .callOnExtension(extension, actionId, callArgs);
  } else {
    callOnExtensionTx = comptrollerProxy.callOnExtension(
      extension,
      actionId,
      callArgs,
    );
  }

  await expect(callOnExtensionTx).resolves.toBeReceipt();

  return callOnExtensionTx;
}
