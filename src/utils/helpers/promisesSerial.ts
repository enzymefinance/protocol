type EncapsulatedPromise<T> = () => Promise<T>;

const promisesSerial = (promises: EncapsulatedPromise<any>[]) =>
  promises.reduce(async (carryPromise, currentPromise) => {
    const carry: any = await carryPromise;
    const current = await currentPromise();
    return [...carry, current];
  }, new Promise(resolve => resolve([])));

export { promisesSerial, EncapsulatedPromise };
