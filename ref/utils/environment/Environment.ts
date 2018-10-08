export default interface Environment {
  readonly confirmer?: Function;
  readonly eth: any;
  readonly track: string;
  readonly wallet?: any;
}
