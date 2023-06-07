// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "../../../../../external-interfaces/INotionalV2Router.sol";
import "../../../../../external-interfaces/IWETH.sol";
import "../../../../../utils/0.6.12/AssetHelpers.sol";
import "./INotionalV2Position.sol";
import "./NotionalV2PositionDataDecoder.sol";

/// @title NotionalV2PositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Notional V2 Positions
contract NotionalV2PositionLib is INotionalV2Position, NotionalV2PositionDataDecoder, AssetHelpers {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    uint16 private constant ETH_CURRENCY_ID = 1;
    uint256 private constant FCASH_DECIMALS_FACTOR = 10 ** 8;

    INotionalV2Router private immutable NOTIONAL_V2_ROUTER_CONTRACT;
    address private immutable WETH_TOKEN;

    constructor(address _notionalV2Router, address _wethToken) public {
        NOTIONAL_V2_ROUTER_CONTRACT = INotionalV2Router(_notionalV2Router);
        WETH_TOKEN = _wethToken;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.AddCollateral)) {
            __actionAddCollateral(actionArgs);
        } else if (actionId == uint256(Actions.Lend)) {
            __actionLend(actionArgs);
        } else if (actionId == uint256(Actions.Redeem)) {
            __actionRedeem(actionArgs);
        } else if (actionId == uint256(Actions.Borrow)) {
            __actionBorrow(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Adds collateral to Notional V2 account
    function __actionAddCollateral(bytes memory _actionArgs) private {
        (uint16 currencyId, uint256 collateralAssetAmount) = __decodeAddCollateralActionArgs(_actionArgs);

        __addCollateral(currencyId, collateralAssetAmount);
    }

    /// @dev Borrows assets from a Notional V2 market
    function __actionBorrow(bytes memory _actionArgs) private {
        (uint16 borrowCurrencyId, bytes32 encodedTrade, uint16 collateralCurrencyId, uint256 collateralAssetAmount) =
            __decodeBorrowActionArgs(_actionArgs);

        if (collateralAssetAmount > 0) {
            __addCollateral(collateralCurrencyId, collateralAssetAmount);
        }

        bytes32[] memory encodedTrades = new bytes32[](1);
        encodedTrades[0] = encodedTrade;

        INotionalV2Router.BalanceActionWithTrades[] memory actionsWithTrades =
            new INotionalV2Router.BalanceActionWithTrades[](1);

        // `withdrawEntireCashBalance: true` sends the borrowed asset to this contract
        // `redeemToUnderlying: true` sends the borrowed asset as the underlying token (e.g., DAI rather than cDAI)
        actionsWithTrades[0] = INotionalV2Router.BalanceActionWithTrades({
            actionType: INotionalV2Router.DepositActionType.None,
            currencyId: borrowCurrencyId,
            depositActionAmount: 0,
            withdrawAmountInternalPrecision: 0,
            withdrawEntireCashBalance: true,
            redeemToUnderlying: true,
            trades: encodedTrades
        });

        NOTIONAL_V2_ROUTER_CONTRACT.batchBalanceAndTradeAction(address(this), actionsWithTrades);

        if (borrowCurrencyId == ETH_CURRENCY_ID) {
            uint256 etherBalance = payable(address(this)).balance;

            IWETH(payable(address(WETH_TOKEN))).deposit{value: etherBalance}();

            // Send borrowed ETH to the vault wrapped as WETH
            ERC20(WETH_TOKEN).safeTransfer(msg.sender, etherBalance);
        } else {
            (, INotionalV2Router.Token memory underlyingAsset) =
                NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(borrowCurrencyId);

            // Send borrowed asset tokens to the vault
            ERC20(underlyingAsset.tokenAddress).safeTransfer(
                msg.sender, ERC20(underlyingAsset.tokenAddress).balanceOf(address(this))
            );
        }
    }

    /// @dev Lends assets to a Notional V2 market
    function __actionLend(bytes memory _actionArgs) private {
        (uint16 currencyId, uint256 underlyingAssetAmount, bytes32 encodedTrade) = __decodeLendActionArgs(_actionArgs);

        bytes32[] memory encodedTrades = new bytes32[](1);
        encodedTrades[0] = encodedTrade;

        INotionalV2Router.BalanceActionWithTrades[] memory actionsWithTrades =
            new INotionalV2Router.BalanceActionWithTrades[](1);

        // It is recommended that `depositActionAmount` is larger than the desired amount to lend,
        // as rates can change between blocks. `withdrawEntireCashBalance = true` will send any
        // excess `underlyingTokenAmount` balance back to this contract.
        actionsWithTrades[0] = INotionalV2Router.BalanceActionWithTrades({
            actionType: INotionalV2Router.DepositActionType.DepositUnderlying,
            currencyId: currencyId,
            depositActionAmount: underlyingAssetAmount,
            withdrawAmountInternalPrecision: 0,
            withdrawEntireCashBalance: true,
            redeemToUnderlying: true,
            trades: encodedTrades
        });

        if (currencyId == ETH_CURRENCY_ID) {
            IWETH(payable(address(WETH_TOKEN))).withdraw(underlyingAssetAmount);

            NOTIONAL_V2_ROUTER_CONTRACT.batchBalanceAndTradeAction{value: underlyingAssetAmount}(
                address(this), actionsWithTrades
            );

            uint256 etherBalance = payable(address(this)).balance;

            IWETH(payable(address(WETH_TOKEN))).deposit{value: etherBalance}();

            if (etherBalance > 0) {
                // Send residual ETH back to the vault wrapped as WETH
                ERC20(WETH_TOKEN).safeTransfer(msg.sender, etherBalance);
            }
        } else {
            (, INotionalV2Router.Token memory underlyingAsset) = NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(currencyId);

            __approveAssetMaxAsNeeded(
                underlyingAsset.tokenAddress, address(NOTIONAL_V2_ROUTER_CONTRACT), underlyingAssetAmount
            );

            NOTIONAL_V2_ROUTER_CONTRACT.batchBalanceAndTradeAction(address(this), actionsWithTrades);

            uint256 underlyingAssetBalance = ERC20(underlyingAsset.tokenAddress).balanceOf(address(this));

            if (underlyingAssetBalance > 0) {
                // Send residual underlying asset tokens back to the vault
                ERC20(underlyingAsset.tokenAddress).safeTransfer(msg.sender, underlyingAssetBalance);
            }
        }
    }

    /// @dev Redeems an amount of yieldTokens from Notional V2 account balances after fCash maturity
    function __actionRedeem(bytes memory _actionArgs) private {
        (uint16 currencyId, uint88 yieldTokenAmount) = __decodeRedeemActionArgs(_actionArgs);

        NOTIONAL_V2_ROUTER_CONTRACT.withdraw(currencyId, yieldTokenAmount, true);

        // Send tokens back to the vault
        if (currencyId == ETH_CURRENCY_ID) {
            IWETH(payable(address(WETH_TOKEN))).deposit{value: payable(address(this)).balance}();

            ERC20(WETH_TOKEN).safeTransfer(msg.sender, ERC20(WETH_TOKEN).balanceOf(address(this)));
        } else {
            (, INotionalV2Router.Token memory underlyingAsset) = NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(currencyId);

            ERC20(underlyingAsset.tokenAddress).safeTransfer(
                msg.sender, ERC20(underlyingAsset.tokenAddress).balanceOf(address(this))
            );
        }
    }

    /// @dev Helper to add non-fCash collateral
    function __addCollateral(uint16 _currencyId, uint256 _amount) private {
        if (_currencyId == ETH_CURRENCY_ID) {
            IWETH(payable(address(WETH_TOKEN))).withdraw(_amount);

            NOTIONAL_V2_ROUTER_CONTRACT.depositUnderlyingToken{value: _amount}(address(this), _currencyId, _amount);
        } else {
            (, INotionalV2Router.Token memory collateralAsset) = NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(_currencyId);

            __approveAssetMaxAsNeeded(collateralAsset.tokenAddress, address(NOTIONAL_V2_ROUTER_CONTRACT), _amount);
            NOTIONAL_V2_ROUTER_CONTRACT.depositUnderlyingToken(address(this), _currencyId, _amount);
        }
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    /// @dev Debt assets are composed by two type of balances: account portfolio and account assets
    /// Both concepts can be found here: https://docs.notional.finance/developer-documentation/how-to/lend-and-borrow-fcash
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        (assets_, amounts_) = __getPositiveOrNegativeAssets(false);
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev Managed assets are composed by two type of balances: account portfolio and account assets
    /// Both concepts can be found here: https://docs.notional.finance/developer-documentation/how-to/lend-and-borrow-fcash
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        return __getPositiveOrNegativeAssets(true);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get all positive or all negative assets within Notional
    function __getPositiveOrNegativeAssets(bool _positiveAssets)
        private
        view
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        (
            ,
            INotionalV2Router.AccountBalance[] memory accountBalances,
            INotionalV2Router.PortfolioAsset[] memory portfolioAssets
        ) = NOTIONAL_V2_ROUTER_CONTRACT.getAccount(address(this));

        // Calculate total assets length

        uint256 totalAssetsLength;

        for (uint256 i; i < portfolioAssets.length; i++) {
            int256 notionalValue = portfolioAssets[i].notional;

            if (_positiveAssets) {
                if (notionalValue <= 0) {
                    continue;
                }
            } else {
                if (notionalValue >= 0) {
                    continue;
                }
            }

            totalAssetsLength++;
        }

        for (uint256 i; i < accountBalances.length; i++) {
            // A currencyId = 0 signals end of used array slots
            if (accountBalances[i].currencyId == 0) {
                break;
            }

            if (_positiveAssets) {
                if (accountBalances[i].cashBalance <= 0) {
                    continue;
                }
            } else {
                if (accountBalances[i].cashBalance >= 0) {
                    continue;
                }
            }

            totalAssetsLength++;
        }

        assets_ = new address[](totalAssetsLength);
        amounts_ = new uint256[](totalAssetsLength);

        // Calculate amounts of portfolio assets

        uint256 assetsIndexCounter;

        for (uint256 i; i < portfolioAssets.length; i++) {
            if (
                (_positiveAssets && portfolioAssets[i].notional > 0)
                    || (!_positiveAssets && portfolioAssets[i].notional < 0)
            ) {
                uint16 currencyId = uint16(portfolioAssets[i].currencyId);

                (, INotionalV2Router.Token memory underlyingAsset) = NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(currencyId);

                assets_[assetsIndexCounter] = underlyingAsset.tokenAddress;

                int256 presentValue;

                uint256 underlyingAssetDecimalsFactor = 10 ** uint256(ERC20(underlyingAsset.tokenAddress).decimals());

                if (block.timestamp >= portfolioAssets[i].maturity) {
                    presentValue = portfolioAssets[i].notional;
                } else {
                    presentValue = NOTIONAL_V2_ROUTER_CONTRACT.getPresentfCashValue(
                        currencyId, portfolioAssets[i].maturity, portfolioAssets[i].notional, block.timestamp, false
                    );
                }

                // Convert negative amounts to positive if dealing with debt assets
                if (!_positiveAssets) {
                    presentValue = -presentValue;
                }

                amounts_[assetsIndexCounter] =
                    uint256(presentValue).mul(underlyingAssetDecimalsFactor).div(FCASH_DECIMALS_FACTOR);

                assetsIndexCounter++;
            }
        }

        // Calculate amounts of account balance assets

        for (uint256 i; i < accountBalances.length; i++) {
            // A currencyId = 0 signals end of used array slots
            if (accountBalances[i].currencyId == 0) {
                break;
            }

            if (
                (_positiveAssets && accountBalances[i].cashBalance > 0)
                    || (!_positiveAssets && accountBalances[i].cashBalance < 0)
            ) {
                (INotionalV2Router.Token memory cashToken,) =
                    NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(accountBalances[i].currencyId);

                assets_[assetsIndexCounter] = cashToken.tokenAddress;

                if (_positiveAssets) {
                    amounts_[assetsIndexCounter] = uint256(accountBalances[i].cashBalance);
                } else {
                    amounts_[assetsIndexCounter] = uint256(-accountBalances[i].cashBalance);
                }

                assetsIndexCounter++;
            }
        }

        // Aggregate similar asset amounts
        if (assets_.length > 1) {
            (assets_, amounts_) = __aggregateAssetAmounts(assets_, amounts_);
        }

        return (assets_, amounts_);
    }
}
