import { Environment } from './Environment';

export const isEnvironment = (
  candidate: Environment | any,
): candidate is Environment => {
  return (
    candidate && !!candidate.eth && !!candidate.track && !!candidate.options
  );
};

//  export { isEnvironment };
