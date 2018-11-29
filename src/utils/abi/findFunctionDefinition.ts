import * as R from 'ramda';

const query = functionName =>
  R.whereEq({ type: 'function', name: functionName });

const findFunctionDefinition = (abi: any, functionName: string) =>
  R.find(query(functionName))(abi);

export { findFunctionDefinition };
