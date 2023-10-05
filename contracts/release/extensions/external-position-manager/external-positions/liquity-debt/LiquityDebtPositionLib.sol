// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import {ILiquityBorrowerOperations} from "../../../../../external-interfaces/ILiquityBorrowerOperations.sol";
import {ILiquityTroveManager} from "../../../../../external-interfaces/ILiquityTroveManager.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {ILiquityDebtPosition} from "./ILiquityDebtPosition.sol";
import {LiquityDebtPositionDataDecoder} from "./LiquityDebtPositionDataDecoder.sol";

/// @title LiquityDebtPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Liquity debt positions
contract LiquityDebtPositionLib is ILiquityDebtPosition, LiquityDebtPositionDataDecoder {
    using SafeERC20 for ERC20;

    address private immutable LIQUITY_BORROWER_OPERATIONS;
    address private immutable LIQUITY_TROVE_MANAGER;

    address private immutable LUSD_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(address _liquityBorrowerOperations, address _liquityTroveManager, address _lusd, address _weth)
        public
    {
        LIQUITY_BORROWER_OPERATIONS = _liquityBorrowerOperations;
        LIQUITY_TROVE_MANAGER = _liquityTroveManager;
        LUSD_TOKEN = _lusd;
        WETH_TOKEN = _weth;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.OpenTrove)) {
            (
                uint256 maxFeePercentage,
                uint256 collateralAmount,
                uint256 lusdAmount,
                address upperHint,
                address lowerHint
            ) = __decodeOpenTroveArgs(actionArgs);
            __openTrove(maxFeePercentage, collateralAmount, lusdAmount, upperHint, lowerHint);
        } else if (actionId == uint256(Actions.AddCollateral)) {
            (uint256 collateralAmount, address upperHint, address lowerHint) =
                __decodeAddCollateralActionArgs(actionArgs);
            __addCollateral(collateralAmount, upperHint, lowerHint);
        } else if (actionId == uint256(Actions.RemoveCollateral)) {
            (uint256 collateralAmount, address upperHint, address lowerHint) =
                __decodeRemoveCollateralActionArgs(actionArgs);
            __removeCollateral(collateralAmount, upperHint, lowerHint);
        } else if (actionId == uint256(Actions.Borrow)) {
            (uint256 maxFeePercentage, uint256 lusdAmount, address upperHint, address lowerHint) =
                __decodeBorrowActionArgs(actionArgs);
            __borrow(maxFeePercentage, lusdAmount, upperHint, lowerHint);
        } else if (actionId == uint256(Actions.RepayBorrow)) {
            (uint256 lusdAmount, address upperHint, address lowerHint) = __decodeRepayBorrowActionArgs(actionArgs);
            __repayBorrow(lusdAmount, upperHint, lowerHint);
        } else if (actionId == uint256(Actions.CloseTrove)) {
            __closeTrove();
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Adds ETH as collateral
    function __addCollateral(uint256 _amount, address _upperHint, address _lowerHint) private {
        IWETH(WETH_TOKEN).withdraw(_amount);

        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).addColl{value: _amount}(_upperHint, _lowerHint);
    }

    /// @dev Borrows LUSD using the available collateral
    function __borrow(uint256 _maxFeePercentage, uint256 _amount, address _upperHint, address _lowerHint) private {
        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).withdrawLUSD(
            _maxFeePercentage, _amount, _upperHint, _lowerHint
        );

        ERC20(LUSD_TOKEN).safeTransfer(msg.sender, _amount);
    }

    /// @dev Closes a trove
    /// It doesn't require to approve LUSD since the balance is directly managed by the borrower operations contract.
    function __closeTrove() private {
        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).closeTrove();

        uint256 ethBalance = address(this).balance;

        IWETH(WETH_TOKEN).deposit{value: ethBalance}();

        // The liquidation reserve is refunded in LUSD when closing a trove
        ERC20(LUSD_TOKEN).safeTransfer(msg.sender, ERC20(LUSD_TOKEN).balanceOf(address(this)));
        ERC20(WETH_TOKEN).safeTransfer(msg.sender, ethBalance);
    }

    /// @dev Opens a new Trove
    function __openTrove(
        uint256 _maxFeePercentage,
        uint256 _collateralAmount,
        uint256 _lusdAmount,
        address _upperHint,
        address _lowerHint
    ) private {
        IWETH(WETH_TOKEN).withdraw(_collateralAmount);

        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).openTrove{value: _collateralAmount}(
            _maxFeePercentage, _lusdAmount, _upperHint, _lowerHint
        );

        ERC20(LUSD_TOKEN).safeTransfer(msg.sender, _lusdAmount);
    }

    /// @dev Removes ETH as collateral
    function __removeCollateral(uint256 _amount, address _upperHint, address _lowerHint) private {
        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).withdrawColl(_amount, _upperHint, _lowerHint);

        IWETH(WETH_TOKEN).deposit{value: _amount}();
        ERC20(WETH_TOKEN).safeTransfer(msg.sender, _amount);
    }

    /// @dev Repays borrowed LUSD, reducing the borrow balance
    /// It doesn't require to approve LUSD since the balance is directly managed by the borower operations contract.
    function __repayBorrow(uint256 _amount, address _upperHint, address _lowerHint) private {
        // Reverts if _amount > total trove debt - min trove debt
        ILiquityBorrowerOperations(LIQUITY_BORROWER_OPERATIONS).repayLUSD(_amount, _upperHint, _lowerHint);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        amounts_ = new uint256[](1);
        amounts_[0] = ILiquityTroveManager(LIQUITY_TROVE_MANAGER).getTroveDebt(address(this));

        // If there's no debt balance, return empty arrays
        if (amounts_[0] == 0) {
            return (new address[](0), new uint256[](0));
        }

        assets_ = new address[](1);
        assets_[0] = LUSD_TOKEN;

        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        amounts_ = new uint256[](1);
        amounts_[0] = ILiquityTroveManager(LIQUITY_TROVE_MANAGER).getTroveColl(address(this));

        // If there's no collateral balance, return empty arrays
        if (amounts_[0] == 0) {
            return (new address[](0), new uint256[](0));
        }

        assets_ = new address[](1);
        assets_[0] = WETH_TOKEN;

        return (assets_, amounts_);
    }
}
