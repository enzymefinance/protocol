// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title INotionalV2Router Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev This interface is a combination of different interfaces: NotionalProxy, NotionalViews, NotionalCalculations
interface INotionalV2Router {
    enum AssetStorageState {
        NoChange,
        Update,
        Delete,
        RevertIfStored
    }
    enum DepositActionType {
        None,
        DepositAsset,
        DepositUnderlying,
        DepositAssetAndMintNToken,
        DepositUnderlyingAndMintNToken,
        RedeemNToken,
        ConvertCashToNToken
    }
    enum TokenType {
        UnderlyingToken,
        cToken,
        cETH,
        Ether,
        NonMintable,
        aToken
    }

    struct AccountBalance {
        uint16 currencyId;
        int256 cashBalance;
        int256 nTokenBalance;
        uint256 lastClaimTime;
        uint256 accountIncentiveDebt;
    }

    struct AccountContext {
        uint40 nextSettleTime;
        bytes1 hasDebt;
        uint8 assetArrayLength;
        uint16 bitmapCurrencyId;
        bytes18 activeCurrencies;
    }

    struct BalanceActionWithTrades {
        DepositActionType actionType;
        uint16 currencyId;
        uint256 depositActionAmount;
        uint256 withdrawAmountInternalPrecision;
        bool withdrawEntireCashBalance;
        bool redeemToUnderlying;
        bytes32[] trades;
    }

    struct PortfolioAsset {
        uint256 currencyId;
        uint256 maturity;
        uint256 assetType;
        int256 notional;
        uint256 storageSlot;
        AssetStorageState storageState;
    }

    struct Token {
        address tokenAddress;
        bool hasTransferFee;
        int256 decimals;
        TokenType tokenType;
        uint256 maxCollateralBalance;
    }

    function batchBalanceAndTradeAction(
        address _account,
        BalanceActionWithTrades[] calldata _actions
    ) external payable;

    function depositUnderlyingToken(
        address _account,
        uint16 _currencyId,
        uint256 _amountExternalPrecision
    ) external payable returns (uint256);

    function getAccount(address _account)
        external
        view
        returns (
            AccountContext memory accountContext_,
            AccountBalance[] memory accountBalances_,
            PortfolioAsset[] memory portfolio_
        );

    function getAccountBalance(uint16 _currencyId, address _account)
        external
        view
        returns (
            int256 cashBalance_,
            int256 nTokenBalance_,
            uint256 lastClaimTime_
        );

    function getAccountPortfolio(address _account)
        external
        view
        returns (PortfolioAsset[] memory portfolio_);

    function getCurrency(uint16 _currencyId)
        external
        view
        returns (Token memory assetToken_, Token memory underlyingToken_);

    function getPresentfCashValue(
        uint16 _currencyId,
        uint256 _maturity,
        int256 _notional,
        uint256 _blockTime,
        bool _riskAdjusted
    ) external view returns (int256 presentValue_);

    function withdraw(
        uint16 _currencyId,
        uint88 _amountInternalPrecision,
        bool _redeemToUnderlying
    ) external returns (uint256 amount_);
}
