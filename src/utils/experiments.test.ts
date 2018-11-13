test('TypeScript function argument interpolation', () => {
  const fn = (a: String) => {
    expect(a).toEqual('asdf');
  };

  // string primitive gets converted to String
  fn('asdf');

  class SuperString extends String {
    readonly additional: number;

    constructor(arg, additional?) {
      super(arg);
      this.additional = additional;
    }
  }

  const suSt = new SuperString('asdf', 123);

  // SuperString also automatically gets converted
  fn(suSt);

  expect(suSt.additional).toEqual(123);

  const superFn = (a: SuperString) => {
    expect(a).toBe('asdf');
  };

  // This gives type errors
  // superFn("asdf")
});

type FN = <T>(a: T) => T;

test('Generics', () => {
  const fn: FN = <T>(a: T) => a;

  const b = fn('asdf');
});
