export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
export const KYBER_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const CALL_ON_INTEGRATION_ENCODING_TYPES = {
  AIR_SWAP: {
    TAKE_ORDER: [
      'bytes' // AIR_SWAP.ORDER
    ],
    ORDER: [
      // [0] signer.wallet
      // [1] signer.token
      // [2] sender.wallet
      // [3] sender.token
      // [4] signature.signatory
      // [5] signature.validator
      'address[6]',
      // [0] nonce
      // [1] expiry
      // [2] signer.amount
      // [3] signer.id
      // [4] sender.amount
      // [5] sender.id
      'uint256[6]',
      // [0] signer.kind
      // [1] sender.kind
      'bytes4[2]',
      // [0] signature.r
      // [1] signature.s
      'bytes32[2]',
      'uint8', // signature.v
      'bytes1' // signature.version
    ]
  },
  ENGINE: {
    TAKE_ORDER: [
      'uint256', // min incoming asset (WETH) amount
      'uint256' // exact outgoing asset (MLN) amount
    ]
  },
  KYBER: {
    TAKE_ORDER: [
      'address', // incoming asset
      'uint256', // min incoming asset amount
      'address', // outgoing asset,
      'uint256' // exact outgoing asset amount
    ]
  },
  OASIS_DEX: {
    TAKE_ORDER: [
      'uint256', // exact outgoing asset amount (fill amount)
      'uint256' // order identifier
    ]
  },
  UNISWAP: {
    TAKE_ORDER: [
      'address', // incoming asset
      'uint256', // min incoming asset amount
      'address', // outgoing asset,
      'uint256' // exact outgoing asset amount
    ]
  },
  ZERO_EX_V2: {
    TAKE_ORDER: [
      'bytes', // ZERO_EX_V2.ORDER
      'uint256' // exact outgoing asset amount (taker asset fill amount)
    ],
    ORDER: [
      // [0] makerAddress
      // [1] takerAddress
      // [2] feeRecipientAddress
      // [3] senderAddress
      'address[4]',
      // [0] makerAssetAmount
      // [1] takerAssetAmount
      // [2] makerFee
      // [3] takerFee
      // [4] expirationTimeSeconds
      // [5] salt
      'uint256[6]',
      // [0] makerAssetData
      // [1] takerAssetData
      'bytes[2]',
      'bytes' // signature
    ]
  },
  ZERO_EX_V3: {
    TAKE_ORDER: [
      'bytes', // ZERO_EX_V2.ORDER
      'uint256' // exact outgoing asset amount (taker asset fill amount)
    ],
    ORDER: [
      // [0] makerAddress
      // [1] takerAddress
      // [2] feeRecipientAddress
      // [3] senderAddress
      'address[4]',
      // [0] makerAssetAmount
      // [1] takerAssetAmount
      // [2] makerFee
      // [3] takerFee
      // [4] expirationTimeSeconds
      // [5] salt
      'uint256[6]',
      // [0] makerAssetData
      // [1] takerAssetData
      // [2] makerFeeAssetData
      // [3] takerFeeAssetData
      'bytes[4]',
      'bytes' // signature
    ]
  },
}

export const CONTRACT_NAMES = {
  ADDRESS_LIST: 'AddressList',
  AIR_SWAP_ADAPTER: 'AirSwapAdapter',
  AMGU_CONSUMER: 'AmguConsumer',
  ASSET_BLACKLIST: 'AssetBlacklist',
  ASSET_WHITELIST: 'AssetWhitelist',
  BURNABLE_TOKEN: 'BurnableToken',
  CONVERSION_RATES: 'ConversionRates',
  ENGINE: 'Engine',
  ENGINE_ADAPTER: 'EngineAdapter',
  ERC20_TRANSFER_HANDLER: 'ERC20TransferHandler',
  FEE_MANAGER: 'FeeManager',
  FEE_MANAGER_FACTORY: 'FeeManagerFactory',
  FUND_FACTORY: 'FundFactory',
  HUB: 'Hub',
  INTEGRATION_ADAPTER: 'IntegrationAdapter',
  IERC20: 'IERC20',
  ERC20_WITH_FIELDS: 'ERC20WithFields',
  KYBER_ADAPTER: 'KyberAdapter',
  KYBER_EXCHANGE: 'KyberNetwork',
  KYBER_MOCK_NETWORK: 'MockKyberNetwork',
  KYBER_NETWORK_PROXY: 'KyberNetworkProxy',
  KYBER_NETWORK_INTERFACE: 'IKyberNetworkProxy',
  KYBER_PRICEFEED: 'KyberPriceFeed',
  KYBER_RESERVE: 'KyberReserve',
  KYBER_WHITELIST: 'KyberWhiteList',
  MALICIOUS_TOKEN: 'MaliciousToken',
  BAD_TOKEN: 'BadERC20Token',
  MANAGEMENT_FEE: 'ManagementFee',
  MAX_CONCENTRATION: 'MaxConcentration',
  MAX_POSITIONS: 'MaxPositions',
  OASIS_DEX_ADAPTER: 'OasisDexAdapter',
  OASIS_DEX_EXCHANGE: 'OasisDexExchange',
  OASIS_DEX_INTERFACE: 'IOasisDex',
  PERFORMANCE_FEE: 'PerformanceFee',
  POLICY: 'Policy',
  POLICY_MANAGER: 'PolicyManager',
  POLICY_MANAGER_FACTORY: 'PolicyManagerFactory',
  PREMINED_TOKEN: 'PreminedToken',
  PRICE_TOLERANCE: 'PriceTolerance',
  REGISTRY: 'Registry',
  SHARES: 'Shares',
  SHARES_FACTORY: 'SharesFactory',
  SHARES_REQUESTOR: 'SharesRequestor',
  SHARES_TOKEN: 'SharesToken',
  SPOKE: 'Spoke',
  STANDARD_TOKEN: 'StandardToken',
  TRADING: 'Trading',
  TRANSFER_HANDLER_REGISTRY: 'TransferHandlerRegistry',
  UNISWAP_ADAPTER: 'UniswapAdapter',
  UNISWAP_FACTORY_INTERFACE: 'IUniswapFactory',
  UNISWAP_EXCHANGE: 'UniswapExchange',
  UNISWAP_EXCHANGE_INTERFACE: 'IUniswapExchange',
  UNISWAP_EXCHANGE_TEMPLATE: 'UniswapExchangeTemplate',
  AIR_SWAP_SWAP: 'AirSwapSwap',
  AIR_SWAP_TYPES: 'AirSwapTypes',
  AIR_SWAP_ADAPTER: 'AirSwapAdapter',
  USER_WHITELIST: 'UserWhitelist',
  VALUE_INTERPRETER: 'ValueInterpreter',
  VAULT: 'Vault',
  VAULT_FACTORY: 'VaultFactory',
  WETH: 'WETH',
  ZERO_EX_V2_ADAPTER: 'ZeroExV2Adapter',
  ZERO_EX_V2_ERC20_PROXY: 'ZeroExV2ERC20Proxy',
  ZERO_EX_V2_EXCHANGE_INTERFACE: 'IZeroExV2',
  ZERO_EX_V3_ADAPTER: 'ZeroExV3Adapter',
  ZERO_EX_V3_ERC20_PROXY: 'ZeroExV3ERC20Proxy',
  ZERO_EX_V3_EXCHANGE_INTERFACE: 'IZeroExV3',
  ZERO_EX_V3_STAKING: 'ZeroExV3Staking',
  ZERO_EX_V3_STAKING_PROXY: 'ZeroExV3StakingProxy',
  ZERO_EX_V3_ZRX_VAULT: 'ZeroExV3ZrxVault'
}
