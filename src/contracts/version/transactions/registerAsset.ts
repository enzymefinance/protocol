import web3EthAbi from 'web3-eth-abi';
import { Address } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';

interface RegisterAssetArgs {
  assetAddress: Address;
  name: String;
  assetSymbol: String; // actually bytes8
  url: String;
  reserveMin: String;
  standards: String[]; // actually uint[]
  sigs: FunctionSignatures[];
}

const prepareArgs: PrepareArgsFunction<RegisterAssetArgs> = async (
  _,
  {
    assetAddress,
    name,
    assetSymbol,
    url,
    reserveMin,
    standards,
    sigs,
  }: RegisterAssetArgs,
) => [
  `${assetAddress}`,
  name,
  assetSymbol,
  url,
  reserveMin,
  standards,
  sigs.map(sig => web3EthAbi.encodeFunctionSignature(sig)),
];

const registerAsset: EnhancedExecute<
  RegisterAssetArgs,
  boolean
> = transactionFactory(
  'registerAsset',
  Contracts.Registry,
  undefined,
  prepareArgs,
);

export { registerAsset };
