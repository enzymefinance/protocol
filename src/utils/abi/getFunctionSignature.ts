import { findFunctionDefinition } from './findFunctionDefinition';
import { MethodAbi } from 'ethereum-protocol';

// this will fail in the case where there is an overload on the abi
const getFunctionSignature = (abi: any, functionName: string): any => {
  const functionDefinition: MethodAbi = findFunctionDefinition(
    abi,
    functionName,
  );
  return `${functionDefinition.name}(${functionDefinition.inputs
    .map(d => d.type)
    .join(',')})`;
};

export { getFunctionSignature };
