// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IStaderUserWithdrawalManager} from "../../../../../external-interfaces/IStaderUserWithdrawalManager.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.8.19/Uint256ArrayLib.sol";
import {IStaderWithdrawalsPosition} from "./IStaderWithdrawalsPosition.sol";

/// @title StaderWithdrawalsPositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for Stader Withdrawals positions
contract StaderWithdrawalsPositionLib is IStaderWithdrawalsPosition {
    using AddressArrayLib for address[];
    using Uint256ArrayLib for uint256[];

    address public immutable ETHX_ADDRESS;
    IStaderUserWithdrawalManager public immutable USER_WITHDRAWAL_MANAGER;
    address public immutable WETH_ADDRESS;

    error StaderWithdrawalsPositionLib__ReceiveCallFromVault__InvalidActionId();

    constructor(address _userWithdrawalManagerAddress, address _ethxAddress, address _wethAddress) {
        ETHX_ADDRESS = _ethxAddress;
        USER_WITHDRAWAL_MANAGER = IStaderUserWithdrawalManager(_userWithdrawalManagerAddress);
        WETH_ADDRESS = _wethAddress;
    }

    /// @notice Initializes the external position
    /// @dev Not access controlled since it only grants ETHx allowance to the withdrawal queue contract
    function init(bytes memory) external override {
        // Grant infinite ETHx allowance to the withdrawal contract
        IERC20(ETHX_ADDRESS).approve(address(USER_WITHDRAWAL_MANAGER), type(uint256).max);
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.RequestWithdrawal)) {
            __actionRequestWithdrawal(abi.decode(actionArgs, (RequestWithdrawalActionArgs)));
        } else if (actionId == uint256(Actions.ClaimWithdrawal)) {
            __actionClaimWithdrawal(abi.decode(actionArgs, (ClaimWithdrawalActionArgs)));
        } else {
            revert StaderWithdrawalsPositionLib__ReceiveCallFromVault__InvalidActionId();
        }
    }

    /// @dev Claims ETH for a finalized ETHx withdrawal request
    function __actionClaimWithdrawal(ClaimWithdrawalActionArgs memory _actionArgs) private {
        // Process the withdrawal
        USER_WITHDRAWAL_MANAGER.claim({_requestId: _actionArgs.requestId});

        // Send ETH to the vault
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    /// @dev Requests ETHx withdrawal
    function __actionRequestWithdrawal(RequestWithdrawalActionArgs memory _actionArgs) private {
        USER_WITHDRAWAL_MANAGER.requestWithdraw({_ethXAmount: _actionArgs.ethXAmount, _owner: address(this)});
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev Uses ETHx as the quote asset until request is finalized, then uses the actual finalized ETH amount
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint256[] memory requestIds = USER_WITHDRAWAL_MANAGER.getRequestIdsByUser({_user: address(this)});

        // Return empty values if there are no requests
        if (requestIds.length == 0) {
            return (new address[](0), new uint256[](0));
        }

        // Separate request values into pending (ETHx) and finalized (ETH)
        uint256 ethXPending;
        uint256 ethFinalized;
        for (uint256 i; i < requestIds.length; i++) {
            IStaderUserWithdrawalManager.UserWithdrawInfo memory userWithdrawInfo =
                USER_WITHDRAWAL_MANAGER.userWithdrawRequests({_requestId: requestIds[i]});

            if (userWithdrawInfo.ethFinalized > 0) {
                ethFinalized += userWithdrawInfo.ethFinalized;
            } else {
                ethXPending += userWithdrawInfo.ethXAmount;
            }
        }

        if (ethXPending > 0) {
            assets_ = assets_.addItem(ETHX_ADDRESS);
            amounts_ = amounts_.addItem(ethXPending);
        }

        if (ethFinalized > 0) {
            assets_ = assets_.addItem(WETH_ADDRESS);
            amounts_ = amounts_.addItem(ethFinalized);
        }

        return (assets_, amounts_);
    }
}
