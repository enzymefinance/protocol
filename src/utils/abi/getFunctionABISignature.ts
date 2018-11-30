import * as Web3EthAbi from 'web3-eth-abi';
import { findFunctionDefinition } from './findFunctionDefinition';

// this will fail in the case where there is an overload on the abi
export const getFunctionABISignature = (abi: any, functionName: string) => {
  return Web3EthAbi.encodeFunctionSignature(
    findFunctionDefinition(abi, functionName),
  );
};
