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
  asset: Address;
  name: String;
  assetSymbol: String; // actually bytes8
  decimals: Number; // actually uint
  url: String;
  ipfsHash: String;
  breakInBreakOut: Address[];
  standards: String[]; // actually uint[]
  sigs: FunctionSignatures[];
}

const prepareArgs: PrepareArgsFunction<RegisterAssetArgs> = async ({
  asset,
  name,
  assetSymbol,
  decimals,
  url,
  ipfsHash,
  breakInBreakOut,
  standards,
  sigs,
}: RegisterAssetArgs) => [
  `${asset}`,
  name,
  assetSymbol,
  `${decimals}`,
  url,
  ipfsHash,
  breakInBreakOut.map(addr => web3EthAbi.encodeFunctionSignature(addr)),
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
