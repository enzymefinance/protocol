export interface Wallet {
  // TODO: Rename this to currentAccount
  address: string;
}

export interface Options {
  readonly gasLimit: string;
  readonly gasPrice: string;
}

export default interface Environment {
  readonly confirmer?: Function;
  readonly eth: any;
  readonly track: string;
  readonly wallet?: Wallet;
  readonly options: Options;
}
