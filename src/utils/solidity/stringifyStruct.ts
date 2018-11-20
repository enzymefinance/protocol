import * as R from 'ramda';

const stringifyStruct = (obj: Object) => {
  const paris = R.toPairs(obj);
  const stringified = R.map(([key, value]) => [key, value.toString()], paris);
  const stringifiedStruct = R.fromPairs(stringified);
  return stringifiedStruct;
};

export { stringifyStruct };
