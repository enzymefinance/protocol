import { SendFunction, Contract, Call, AddressLike, contract, resolveArguments } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish, BytesLike, providers, utils } from 'ethers';
import { GasRelayPaymasterLib } from '../../contracts';
import { isTypedDataSigner } from '../signer';

interface GsnForwarder extends Contract<GsnForwarder> {
  getNonce: Call<(sender: AddressLike) => BigNumber, Contract<any>>;
}

const GsnForwarder = contract<GsnForwarder>()`
  function getNonce(address sender) view returns (uint256)
`;

export interface RelayRequest {
  from: string;
  to: string;
  value: BigNumber;
  gas: BigNumber;
  nonce: BigNumber;
  data: string;
  validUntil: BigNumber;
}

export interface RelayData {
  pctRelayFee: BigNumber;
  baseRelayFee: BigNumber;
  relayWorker: string;
  paymasterData: BytesLike;
  clientId: BigNumber;
  paymaster: string;
  forwarder: string;
  gasPrice: BigNumber;
}

export interface SignedRelayRequest {
  signedRelayRequest: string;
  relayRequest: RelayRequest;
  relayData: RelayData;
}

export interface CreateSignedRelayRequestOptions {
  sendFunction: SendFunction<any, any>;
  vaultPaymaster: string;
  relayWorker: string;
  customProvider?: providers.Provider;
  pctRelayFee?: BigNumberish;
  baseRelayFee?: BigNumberish;
  clientId?: BigNumberish;
  paymasterData?: BytesLike;
}

export async function createSignedRelayRequest({
  sendFunction,
  vaultPaymaster,
  relayWorker,
  customProvider,
  pctRelayFee = BigNumber.from(0),
  baseRelayFee = BigNumber.from(0),
  clientId = BigNumber.from(1),
  paymasterData = utils.defaultAbiCoder.encode(['bool'], [true]),
}: CreateSignedRelayRequestOptions): Promise<SignedRelayRequest> {
  const provider = customProvider ?? sendFunction.contract.signer?.provider;
  if (!provider) {
    throw new Error('Missing provider');
  }

  const signer = sendFunction.contract.signer;
  if (!(signer && isTypedDataSigner(signer))) {
    throw new Error('Missing or invalid signer');
  }

  const inputs = sendFunction.fragment.inputs;
  const args = resolveArguments(inputs, sendFunction.options.args);
  const data = sendFunction.contract.abi.encodeFunctionData(sendFunction.fragment, args) ?? '0x';
  const value = BigNumber.from(sendFunction.options.value ?? BigNumber.from(0));
  const to = sendFunction.contract.address.toLowerCase();
  const from = (await signer.getAddress()).toLowerCase();
  const forwarder = await new GasRelayPaymasterLib(vaultPaymaster, provider).trustedForwarder();
  const nonce = await new GsnForwarder(forwarder, provider).getNonce(from);

  let gas: BigNumber;

  try {
    gas = BigNumber.from(sendFunction.options.gas ?? (await sendFunction.estimate()));
  } catch (e) {
    throw new Error(`Failed to estimate relayed transaction: ${e}`);
  }

  const relayRequest: RelayRequest = {
    from,
    to,
    value,
    nonce,
    data,
    gas,
    validUntil: BigNumber.from(0), // TODO: Expose this as configuration?
  };

  const relayData: RelayData = {
    pctRelayFee: BigNumber.from(pctRelayFee),
    baseRelayFee: BigNumber.from(baseRelayFee),
    relayWorker,
    paymasterData,
    clientId: BigNumber.from(clientId),
    paymaster: vaultPaymaster,
    forwarder,
    gasPrice: BigNumber.from(sendFunction.options.price ?? 1),
  };

  const domain = {
    name: 'GSN Relayed Transaction',
    version: '2',
    chainId: (await provider.getNetwork()).chainId,
    verifyingContract: forwarder,
  };

  const types = {
    RelayData: [
      { name: 'gasPrice', type: 'uint256' },
      { name: 'pctRelayFee', type: 'uint256' },
      { name: 'baseRelayFee', type: 'uint256' },
      { name: 'relayWorker', type: 'address' },
      { name: 'paymaster', type: 'address' },
      { name: 'forwarder', type: 'address' },
      { name: 'paymasterData', type: 'bytes' },
      { name: 'clientId', type: 'uint256' },
    ],
    RelayRequest: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'validUntil', type: 'uint256' },
      { name: 'relayData', type: 'RelayData' },
    ],
  };

  const signedRelayRequest = await signer._signTypedData(domain, types, {
    ...relayRequest,
    relayData,
  });

  return {
    relayData,
    relayRequest,
    signedRelayRequest,
  };
}
