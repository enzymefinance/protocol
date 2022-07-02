// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ITestNotionalV2Router Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestNotionalV2Router {
    enum AssetStorageState {NoChange, Update, Delete, RevertIfStored}

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

    function initializeMarkets(uint16 _currencyId, bool _isFirstInit) external;

    function getActiveMarkets(uint16 _currencyId)
        external
        view
        returns (MarketParameters[] memory marketParameters_);

    function getAccountBalance(uint16 _currencyId, address _account)
        external
        view
        returns (
            int256 cashBalance_,
            int256 nTokenBalance_,
            uint256 lastClaimTime_
        );

    function getAccountContext(address _account)
        external
        view
        returns (AccountContext memory accountContext_);

    function getAccountPortfolio(address _account)
        external
        view
        returns (PortfolioAsset[] memory portfolioAsset_);

    function settleAccount(address _account) external;
}
