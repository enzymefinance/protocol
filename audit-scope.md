# Melon v2 Audit Scope

The doc defines the scope of the v2 audit by listing all contracts that are in-scope, paired with their latest commit hash

## Ready for audit

### Initial scope

`persistent/dispatcher/Dispatcher.sol`: 68f1fd5b1de63d2a7d6cfabb5f0c3b1d032f2916

`persistent/vault/VaultLibBase1.sol`: fcb24a47a2ec9e94d901edc0c2eeb108af8b6751

`persistent/vault/VaultLibBaseCore.sol`: d0499e10b9d33b9b9db53a10871ca94ba9b05989

`persistent/vault/VaultProxy.sol`: d0499e10b9d33b9b9db53a10871ca94ba9b05989

`persistent/vault/utils/ProxiableVaultLib.sol`: d0499e10b9d33b9b9db53a10871ca94ba9b05989

`persistent/vault/utils/SharesTokenBase.sol`: f063f2eb7480bebd59086273e7dace5823801a80

`persistent/vault/utils/VaultLibSafeMath.sol`: fcb24a47a2ec9e94d901edc0c2eeb108af8b6751

`release/core/fund/comptroller/ComptrollerLib.sol`: 10e1179a7a0f7f24b11ab616f1dc26583a111511

`release/core/fund/comptroller/ComptrollerProxy.sol`: d0499e10b9d33b9b9db53a10871ca94ba9b05989

`release/core/fund/comptroller/libs/FundLifecycleLib.sol`: 6151361ee67d2d7242bfe76398ded7cb2d7b0f5d

`release/core/fund/comptroller/libs/PermissionedVaultLib.sol`: 6151361ee67d2d7242bfe76398ded7cb2d7b0f5d

`release/core/fund/comptroller/utils/ComptrollerEvents.sol`: 6ecd09afadf0da876e6da480fd81c845a4fbec46

`release/core/fund/comptroller/utils/ComptrollerStorage.sol`: 6ecd09afadf0da876e6da480fd81c845a4fbec46

`release/core/fund/vault/VaultLib.sol`: 6b753222c1b7494bc16c6b259b7889bf62445151

`release/core/fund-deployer/FundDeployer.sol`: 68f1fd5b1de63d2a7d6cfabb5f0c3b1d032f2916

`release/extensions/fee-manager/FeeManager.sol`: dcaac487d1db02b349c0439aa38c0e8f3bf043bb

`release/extensions/fee-manager/fees/EntranceRateBurnFee.sol`: ef5d15e78a8ef3764d2edca4968fdf5df34722be

`release/extensions/fee-manager/fees/EntranceRateDirectFee.sol`: ef5d15e78a8ef3764d2edca4968fdf5df34722be

`release/extensions/fee-manager/fees/PerformanceFee.sol`: 10e1179a7a0f7f24b11ab616f1dc26583a111511

`release/extensions/fee-manager/fees/utils/EntranceRateFeeBase.sol`:10e1179a7a0f7f24b11ab616f1dc26583a111511

`release/extensions/fee-manager/fees/utils/FeeBase.sol`: 10e1179a7a0f7f24b11ab616f1dc26583a111511

`release/extensions/integration-manager/IntegrationManager.sol`: 5ea5a601a83b069987aeb853596ab53832e9e474

`release/extensions/integration-manager/integrations/adapters/ChaiAdapter.sol`: ea1afef565c53f048f6f65c3be8fb65477aaaec3

`release/extensions/integration-manager/integrations/adapters/CompoundAdapter.sol`: 87df803edd4935ff20c9e71c8c618333cf4107f4

`release/extensions/integration-manager/integrations/adapters/KyberAdapter.sol`: ff650533354c762146b6059dae0df96a82c84667

`release/extensions/integration-manager/integrations/adapters/TrackedAssetsAdapter.sol`: 67181631f15409b39a18407f09b963b6b3bfdfb3

`release/extensions/integration-manager/integrations/adapters/ZeroExV2Adapter.sol`: 38b2d1e48612dbc7996325581c2af9c18d47341b

`release/extensions/integration-manager/integrations/utils/AdapterBase.sol`: 87df803edd4935ff20c9e71c8c618333cf4107f4

`release/extensions/integration-manager/integrations/utils/IntegrationSelectors.sol`: f063f2eb7480bebd59086273e7dace5823801a80

`release/extensions/policy-manager/PolicyManager.sol`: 5be60d588679121990fbd61fe1e2ab20247505d5

`release/extensions/policy-manager/policies/buy-shares/InvestorWhitelist.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/buy-shares/utils/PreBuySharesValidatePolicyBase.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/AdapterBlacklist.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/AdapterWhitelist.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/AssetBlacklist.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/AssetWhitelist.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/MaxConcentration.sol`: ac5e86523f21480601308c49c895b16a21a11d2f

`release/extensions/policy-manager/policies/call-on-integration/utils/PostCallOnIntegrationValidatePolicyBase.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/call-on-integration/utils/PreCallOnIntegrationValidatePolicyBase.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/utils/AddressListPolicyMixin.sol`: 5b9121cd11707ae5389420a2daa6121d19021cdc

`release/extensions/policy-manager/policies/utils/PolicyBase.sol`: f063f2eb7480bebd59086273e7dace5823801a80

`release/extensions/utils/ExtensionBase.sol`: f063f2eb7480bebd59086273e7dace5823801a80

`release/extensions/utils/FundDeployerOwnerMixin.sol`: 374d7364f5f9ce219c1ef4619b02770f7376b2ab

`release/extensions/utils/PermissionedVaultActionMixin.sol`: f063f2eb7480bebd59086273e7dace5823801a80

`release/extensions/utils/SharesInflationMixtin.sol`: 67181631f15409b39a18407f09b963b6b3bfdfb3

`release/infrastructure/price-feeds/derivatives/AggregatedDerivativePriceFeed.sol`: 8f1b5ced2f2aa4af376b18960f4155d2a67d17f8

`release/infrastructure/price-feeds/derivatives/feeds/ChaiPriceFeed.sol`: 0e927cbf124ff3adfa0513383f7080d04d138ada

`release/infrastructure/price-feeds/derivatives/feeds/CompoundPriceFeed.sol`: ed795133aec4d624587db15f2c343ec619a27e13

`release/infrastructure/price-feeds/primitives/ChainlinkPriceFeed.sol`: 2963e2a030a391620e3c79b540a227e25d911779

`release/infrastructure/price-feeds/utils/DispatcherOwnerMixin.sol`: 2566afcd9f7b1981350025a4b1f16d1c0c46c5f6

`release/infrastructure/value-interpreter/ValueInterpreter.sol`: ed795133aec4d624587db15f2c343ec619a27e13

`release/utils/AddressArrayLib.sol`: 09119271bbbec2745c7578ffe2571cdfabb41c72

`release/utils/MathHelpers.sol`: f063f2eb7480bebd59086273e7dace5823801a80

### Added scope - 2020/11/15

`release/extensions/policy-manager/policies/buy-shares/MinMaxInvestment.sol`: 303ad2d3970593a1564d9500cffc1d1559035e26

## Forthcoming

### Adapters

`ParaswapAdapter.sol`

`SynthetixAdapter.sol`

`UniswapV2Adapter.sol`

### Policies

`GuaranteedRedemption.sol`

### Fees

`ManagementFee.sol`

### Derivative Price Feeds

`SynthetixPriceFeed.sol`

`UniswapV2PoolPriceFeed.sol`

`WDGLDPriceFeed.sol`
