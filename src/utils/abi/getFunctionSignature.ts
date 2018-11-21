import * as R from 'ramda';
import * as Web3EthAbi from 'web3-eth-abi';

const query = functionName =>
  R.whereEq({ type: 'function', name: functionName });

const findFunctionDefinition = (abi: any, functionName: string) =>
  R.find(query(functionName))(abi);

// this will fail in the case where there is an overload on the abi
export const getFunctionSignature = (abi: any, functionName: string) => {
  return Web3EthAbi.encodeFunctionSignature(
    findFunctionDefinition(abi, functionName),
  );
};
