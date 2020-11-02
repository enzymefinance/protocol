type Resolved<T> = T extends Promise<infer R> ? R : T;

export type DeploymentHandler<TDeployment = any, TConfig = any, TOutput = any> = (
  config: TConfig,
  deployment: TDeployment,
) => TOutput;

export type DeploymentHandlers<TConfig, TDeployment> = {
  [TKey in keyof TDeployment]: DeploymentHandler<TDeployment, TConfig, TDeployment[TKey]>;
} & {
  [key: string]: DeploymentHandler<TDeployment, TConfig>;
};

export type Deployment<THandlers extends DeploymentHandlers<any, any>> = {
  [TKey in keyof THandlers]: Resolved<ReturnType<THandlers[TKey]>>;
};

export type DeploymentProxy<THandlers extends DeploymentHandlers<any, any>> = {
  [TKey in keyof THandlers]: ReturnType<THandlers[TKey]>;
};

function createRecursionAwareProxy<THandlers extends DeploymentHandlers<any, any>, TConfig>(
  constructors: THandlers,
  config: TConfig,
  state: DeploymentProxy<THandlers>,
  prefix: string[] = [],
) {
  return new Proxy(state, {
    ownKeys: () => Object.keys(constructors),
    get: (target, prop, receiver) => {
      if (!constructors.hasOwnProperty(prop)) {
        return Reflect.get(target, prop, receiver);
      }

      if (prefix.includes(prop as string)) {
        const joined = prefix.concat(prop as string).join(' => ');
        throw new Error(`Recursive deployment dependency detected: ${joined}`);
      }

      if (constructors.hasOwnProperty(prop) && !Reflect.has(target, prop)) {
        const path = prefix.concat(prop as string);
        const proxy = createRecursionAwareProxy(constructors, config, state, path);

        const promise = constructors[prop as keyof THandlers](config, proxy);
        Reflect.set(target, prop, promise, receiver);
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export function createDeploymentProxy<THandlers extends DeploymentHandlers<any, any>, TConfig>(
  constructors: THandlers,
  config: TConfig,
) {
  const state = {} as DeploymentProxy<THandlers>;
  return createRecursionAwareProxy(constructors, config, state);
}

export async function resolveDeploymentProxy<THandlers extends DeploymentHandlers<any, any>>(
  proxy: DeploymentProxy<THandlers>,
) {
  const keys = Object.getOwnPropertyNames(proxy);
  return keys.reduce(async (carry, current) => {
    return { ...(await carry), [current]: await proxy[current] };
  }, Promise.resolve({} as Deployment<THandlers>));
}

export function describeDeployment<TConfig, TOutput>(handlers: DeploymentHandlers<TConfig, TOutput>) {
  return function deploy(config: TConfig) {
    const proxy = createDeploymentProxy(handlers, config);
    return resolveDeploymentProxy(proxy);
  };
}
