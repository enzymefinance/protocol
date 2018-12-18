import web3EthAbi from 'web3-eth-abi';
import { Address } from '@melonproject/token-math/address';
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
  decimals: Number; // actually uint
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
    decimals,
    url,
    reserveMin,
    standards,
    sigs,
  }: RegisterAssetArgs,
) => [
  `${assetAddress}`,
  name,
  assetSymbol,
  `${decimals}`,
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
