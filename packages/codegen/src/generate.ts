import type { ConstructorFragment } from '@ethersproject/abi';
import { utils } from 'ethers';

export function getInput(fragment: ConstructorFragment) {
  const inputs = fragment.inputs.map((input, index) => {
    const name = input.name || `arg${index}`;
    const type = getType(input, true);

    return `${name}: ${type}`;
  });

  return inputs.join(', ');
}

export function getOutput(fragment: ConstructorFragment) {
  if (!utils.FunctionFragment.isFunctionFragment(fragment)) {
    return 'void';
  }

  const outputs = fragment.outputs ?? [];

  if (!outputs.length) {
    return 'void';
  }

  if (outputs.length === 1) {
    return getType(outputs[0], false);
  }

  const struct = outputs.map((param, index) => {
    const name = param.name || `'${index}'`;

    return `${name}: ${getType(param, false)}`;
  });

  return `{ ${struct.join(', ')} }`;
}

export function getType(param: utils.ParamType, flexible?: boolean): string {
  if (param.type === 'array' || param.type.substr(-1) === ']') {
    const type = getType(param.arrayChildren, flexible);
    const matches = param.type.match(/\[([0-9]*)\]$/);

    if (matches?.[1]) {
      // This is a fixed length array.
      const range = Array.from(Array(parseInt(matches[1], 10)).keys());

      return `[${range.map(() => type).join(', ')}]`;
    }

    // Arbitrary length array.
    return `${type}[]`;
  }

  if (param.type === 'tuple') {
    const struct = param.components.map((param, index) => {
      const name = param.name || `'${index}'`;

      return `${name}: ${getType(param, flexible)}`;
    });

    return `{ ${struct.join(', ')} }`;
  }

  if (param.type === 'string') {
    return 'string';
  }

  if (param.type === 'bool') {
    return 'boolean';
  }

  if (param.type === 'address') {
    return flexible ? 'AddressLike' : 'string';
  }

  if (param.type.startsWith('bytes')) {
    return flexible ? 'BytesLike' : 'string';
  }

  if (param.type.startsWith('uint')) {
    return flexible ? 'BigNumberish' : 'BigNumber';
  }

  if (param.type.startsWith('int')) {
    return flexible ? 'BigNumberish' : 'BigNumber';
  }

  return 'any';
}

export function generateFunction(contract: string, fragment: utils.FunctionFragment) {
  const type = fragment.constant ? 'Call' : 'Send';
  const input = getInput(fragment);
  const output = getOutput(fragment);

  return `${type}<(${input}) => ${output}, ${contract}>`;
}

export function generateFunctions(contract: string, fragments: utils.FunctionFragment[]) {
  if (!fragments.length) {
    return '';
  }

  const output = fragments.reduce<string[]>((output, fragment, index, array) => {
    const type = generateFunction(contract, fragment);
    const found = array.findIndex((current) => fragment.name === current.name);

    if (index === found) {
      output.push(`${fragment.name}: ${type}`);
    }

    return output;
  }, []);

  return output.join('\n  ');
}

export function generateConstructorArgs(fragment: ConstructorFragment) {
  const input = getInput(fragment);

  return input ? `[${input}]` : '';
}

export function generateContract(name: string, bytecode: string | undefined, abi: utils.Interface) {
  const functions = generateFunctions(name, Object.values(abi.functions));
  const constructor = generateConstructorArgs(abi.deploy);
  const generic = `${name}${constructor ? `, ${name}Args` : ''}`;
  const formatted = abi.format();

  // prettier-ignore
  return `/* eslint-disable */
// @ts-nocheck
import { BytesLike, BigNumber, BigNumberish } from 'ethers';
import { contract, Call, Send, AddressLike, Contract } from '@enzymefinance/ethers';

${constructor ? `export type ${name}Args = ${constructor};` : ''}

// prettier-ignore
export interface ${name} extends Contract<${name}> {
  ${functions || '// No external functions'}
}

let ${name}Bytecode: string | undefined = undefined;
${bytecode ? `if (typeof window === 'undefined') {
  ${name}Bytecode = '${bytecode}';
}` : ''}

// prettier-ignore
export const ${name} = contract<${generic}>(${name}Bytecode)\`
  ${Array.isArray(formatted) ? formatted.join('\n  ') : formatted}
\`;`;
}
