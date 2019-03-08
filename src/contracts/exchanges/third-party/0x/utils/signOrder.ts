import { signatureUtils, orderHashUtils } from '@0x/order-utils';
import { Order, SignedOrder, SignatureType } from '@0x/types';
import { Address } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';

const signWithWeb3Wrapper = async (environment, order, signer) => {
  const signedOrder = await signatureUtils.ecSignOrderAsync(
    environment.eth.currentProvider,
    order,
    signer,
  );
  return signedOrder;
};

const signWithWallet = async (environment, order, signer) => {
  const orderHash = orderHashUtils.getOrderHashHex(order);
  const signature = await environment.wallet.signMessage(orderHash);

  const converted = signatureUtils.convertECSignatureToSignatureHex(signature);

  const signedOrder = {
    ...order,
    signature: converted,
  };
  return signedOrder;
};

// This is just a reference implementation
const signOrder = async (
  environment: Environment,
  order: Order,
  signer?: Address,
): Promise<SignedOrder> => {
  // const orderHash = orderHashUtils.getOrderHashHex(order);
  // const web3signature = await environment.eth.sign(
  //   orderHash,
  //   environment.wallet.address.toString(),
  // );
  const orderSigner = (signer || environment.wallet.address).toLowerCase();

  const signedOrder = environment.wallet.signMessage
    ? await signWithWallet(environment, order, orderSigner)
    : await signWithWeb3Wrapper(environment, order, orderSigner);

  const signatureTyped =
    signedOrder.makerAddress.toLowerCase() === orderSigner
      ? signedOrder
      : {
          ...signedOrder,
          signature: `${signedOrder.signature.slice(0, -1)}${
            SignatureType.PreSigned
          }`,
        };
  return signatureTyped;
};

export { signOrder };
