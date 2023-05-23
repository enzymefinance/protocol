import { Contract, resolveAddress } from '@enzymefinance/ethers';
import { BigNumber, utils } from 'ethers';

export function resolveFunctionFragment(
  subject: Contract | utils.FunctionFragment | string,
  fragment?: utils.FunctionFragment | string,
) {
  const resolved = resolveFragment(subject, fragment);

  if (!utils.FunctionFragment.isFunctionFragment(resolved)) {
    throw new Error(`Failed to resolve function fragment. Received event fragment ${resolved.format('full')}`);
  }

  return resolved;
}

export function resolveEventFragment(
  subject: Contract | utils.EventFragment | string,
  fragment?: utils.EventFragment | string,
) {
  const resolved = resolveFragment(subject, fragment);

  if (!utils.EventFragment.isEventFragment(resolved)) {
    throw new Error(`Failed to resolve event fragment. Received function fragment ${resolved.format('full')}`);
  }

  return resolved;
}

export function resolveFragment(
  subject: Contract | utils.EventFragment | utils.FunctionFragment | string,
  fragment?: utils.EventFragment | utils.FunctionFragment | string,
): utils.EventFragment | utils.FunctionFragment {
  if (utils.EventFragment.isEventFragment(subject) || utils.FunctionFragment.isFunctionFragment(subject)) {
    return subject;
  }

  if (utils.EventFragment.isEventFragment(fragment) || utils.FunctionFragment.isFunctionFragment(fragment)) {
    return fragment;
  }

  // eslint-disable-next-line eqeqeq
  if (fragment == null && typeof subject === 'string' && subject.indexOf('(')) {
    const fragment = utils.Fragment.fromString(subject);

    if (utils.EventFragment.isEventFragment(fragment) || utils.FunctionFragment.isFunctionFragment(fragment)) {
      return fragment;
    }
  }

  if (Contract.isContract(subject)) {
    // eslint-disable-next-line eqeqeq
    if (fragment == null) {
      throw new Error('Missing event/function fragment or name');
    }

    if (utils.isHexString(fragment)) {
      for (const name in subject.abi.functions) {
        if (fragment === subject.abi.getSighash(name)) {
          return subject.abi.functions[name];
        }
      }

      for (const name in subject.abi.events) {
        if (fragment === subject.abi.getSighash(name)) {
          return subject.abi.functions[name];
        }
      }
    } else if (!fragment.includes('(')) {
      const name = fragment.trim();
      const fns = Object.entries(subject.abi.functions);
      const events = Object.entries(subject.abi.events);
      const [, match] =
        [...fns, ...events].find(([key]) => {
          return key.split('(')[0] === name;
        }) ?? [];

      // eslint-disable-next-line eqeqeq
      if (match != null) {
        return match;
      }
    }
  }

  throw new Error(`Failed to resolve function or event fragment ${fragment}`);
}

const asymmetricMatcher = Symbol.for('jest.asymmetricMatcher');

export function resolveParamMatchers(params: utils.ParamType | utils.ParamType[], value: any): any {
  if (typeof value === 'undefined') {
    return expect.anything();
  }

  if (value?.$$typeof === asymmetricMatcher) {
    return value;
  }

  if (Array.isArray(params)) {
    // Verify that there are no unexpected params.
    if (Array.isArray(value)) {
      if (value.length !== params.length) {
        const formatted = params.map((param) => param.format('full')).join(', ');

        throw new Error(`Array length of expected value doesn't match parameter array length ([${formatted}])`);
      }
    } else if (typeof value === 'object') {
      const keys = params.map((param, index) => `${param.name || index}`);
      const mismatch = Object.keys(value).find((key) => !keys.includes(key));

      // eslint-disable-next-line eqeqeq
      if (mismatch != null) {
        const formatted = params.map((param) => param.format('full')).join(', ');

        throw new Error(`Invalid key "${mismatch}" for parameter shape (${formatted})`);
      }
    }

    return params.map((type, index) => {
      const key = `${Array.isArray(value) ? index : type.name}`;
      const inner = value?.[key];

      // All named parameters are required. Unnamed ones are optional.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,eqeqeq
      if (inner == null && type.name != null) {
        throw new Error(`Missing value for param (${type.format('full')})`);
      }

      return resolveParamMatchers(type, inner);
    });
  }

  if (params.type === 'address') {
    return resolveAddress(value);
  }

  if (params.type === 'tuple') {
    return resolveParamMatchers(params.components, value);
  }

  if (params.baseType === 'array') {
    if (!Array.isArray(value)) {
      throw new Error('Invalid array value');
    }

    return value.map((inner) => {
      return resolveParamMatchers(params.arrayChildren, inner);
    });
  }

  if (params.type.match(/^u?int/)) {
    return `${BigNumber.from(value)}`;
  }

  return value;
}
