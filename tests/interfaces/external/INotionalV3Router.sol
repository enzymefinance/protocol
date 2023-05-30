// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface INotionalV3Router {
    enum AssetStorageState {
        NoChange,
        Update,
        Delete,
        RevertIfStored
    }

    enum MarketIndex {
        None,
        ThreeMonths,
        SixMonths,
        OneYear,
        TwoYears,
        FiveYears,
        TenYears,
        TwentyYears
    }

    enum TradeActionType {
        Lend,
        Borrow,
        AddLiquidity,
        RemoveLiquidity,
        PurchaseNTokenResidual,
        SettleCashDebt
    }

    struct AccountContext {
        uint40 nextSettleTime;
        bytes1 hasDebt;
        uint8 assetArrayLength;
        uint16 bitmapCurrencyId;
        bytes18 activeCurrencies;
    }

    struct MarketParameters {
        bytes32 storageSlot;
        uint256 maturity;
        int256 totalfCash;
        int256 totalAssetCash;
        int256 totalLiquidity;
        uint256 lastImpliedRate;
        uint256 oracleRate;
        uint256 previousTradeTime;
    }

    struct PortfolioAsset {
        uint256 currencyId;
        uint256 maturity;
        uint256 assetType;
        int256 notional;
        uint256 storageSlot;
        AssetStorageState storageState;
    }

    function getActiveMarkets(uint16 _currencyId) external view returns (MarketParameters[] memory marketParameters_);

    function getAccountBalance(uint16 _currencyId, address _account)
        external
        view
        returns (int256 cashBalance_, int256 nTokenBalance_, uint256 lastClaimTime_);

    function getAccountContext(address _account) external view returns (AccountContext memory accountContext_);

    function getAccountPortfolio(address _account) external view returns (PortfolioAsset[] memory portfolioAsset_);

    function getPresentfCashValue(
        uint16 _currencyId,
        uint256 _maturity,
        int256 _notional,
        uint256 _blockTime,
        bool _riskAdjusted
    ) external view returns (int256 presentValue_);

    function initializeMarkets(uint16 _currencyId, bool _isFirstInit) external;

    function settleAccount(address _account) external;
}
