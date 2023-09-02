// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {ILidoWithdrawalQueue} from "../../../../../external-interfaces/ILidoWithdrawalQueue.sol";
import {LidoWithdrawalsPositionLibBase1} from
    "../../../../../persistent/external-positions/lido-withdrawals/LidoWithdrawalsPositionLibBase1.sol";
import {ILidoWithdrawalsPosition} from "./ILidoWithdrawalsPosition.sol";
import {LidoWithdrawalsPositionDataDecoder} from "./LidoWithdrawalsPositionDataDecoder.sol";

/// @title LidoWithdrawalsPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Lido Withdrawals positions
/// @dev Only the request owner can claim the withdrawal for that request (Lido's logic),
/// so the requests stored in this contract should always be consistent.
/// If that were to change and a third party claimed a request on behalf,
/// then the claimed WETH would live in this contract (but not double-counted in valuation).
/// New logic would be needed to reconcile already-claimed withdrawals.
contract LidoWithdrawalsPositionLib is
    LidoWithdrawalsPositionLibBase1,
    ILidoWithdrawalsPosition,
    LidoWithdrawalsPositionDataDecoder
{
    address private immutable STETH_ADDRESS;
    ILidoWithdrawalQueue private immutable WITHDRAWAL_QUEUE;

    constructor(ILidoWithdrawalQueue _withdrawalQueue, address _stethAddress) {
        STETH_ADDRESS = _stethAddress;
        WITHDRAWAL_QUEUE = _withdrawalQueue;
    }

    /// @notice Initializes the external position
    /// @dev Not access controlled since it only grants stETH allowance to the withdrawal queue contract
    function init(bytes memory) external override {
        // Grant infinite stETH allowance to the withdrawal queue contract
        ERC20(STETH_ADDRESS).approve(address(WITHDRAWAL_QUEUE), type(uint256).max);
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.RequestWithdrawals)) {
            __requestWithdrawals(actionArgs);
        } else if (actionId == uint256(Actions.ClaimWithdrawals)) {
            __claimWithdrawals(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Claims ETH for finalized stETH withdrawal requests
    function __claimWithdrawals(bytes memory _actionArgs) private {
        (uint256[] memory requestIds, uint256[] memory hints) = __decodeClaimWithdrawalsActionArgs(_actionArgs);

        // Process the claims, specifying the VaultProxy as the ETH recipient
        WITHDRAWAL_QUEUE.claimWithdrawalsTo({_requestIds: requestIds, _hints: hints, _recipient: msg.sender});

        // Remove the requests info from storage
        for (uint256 i; i < requestIds.length; i++) {
            uint256 claimedRequestId = requestIds[i];

            uint256 storedRequestsLength = requests.length;
            for (uint256 j; j < storedRequestsLength; j++) {
                uint256 storedRequestId = requests[j].id;

                if (storedRequestId == claimedRequestId) {
                    uint256 finalIndex = storedRequestsLength - 1;
                    if (storedRequestId != finalIndex) {
                        requests[j] = requests[finalIndex];
                    }

                    requests.pop();

                    emit RequestRemoved(claimedRequestId);

                    break;
                }
            }
        }
    }

    /// @dev Requests stETH withdrawals
    function __requestWithdrawals(bytes memory _actionArgs) private {
        (uint256[] memory amounts) = __decodeRequestWithdrawalsActionArgs(_actionArgs);

        // Create the withdrawal requests
        uint256[] memory requestIds = WITHDRAWAL_QUEUE.requestWithdrawals({_amounts: amounts, _owner: address(this)});

        // Store the requests info
        for (uint256 i; i < requestIds.length; i++) {
            uint256 id = requestIds[i];
            uint256 amount = amounts[i];

            // Down-casting is safe because `requestId` is incrementing from 0
            // and `amount` is validated by the interactions
            requests.push(Request({id: uint128(id), amount: uint128(amount)}));

            emit RequestAdded(id, amount);
        }
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
    /// @dev Uses stETH rather than ETH as the asset for position valuation,
    /// as it should more closely reflect any socialized losses that may occur
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint256 requestsCount = requests.length;

        // Return empty values if there are no requests
        if (requestsCount == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](1);
        assets_[0] = STETH_ADDRESS;
        amounts_ = new uint256[](1);

        // Sum the amounts of all requests
        for (uint256 i; i < requestsCount; i++) {
            amounts_[0] += requests[i].amount;
        }

        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets info for all active (unclaimed) requests
    /// @return requests_ The requests info
    function getRequests() external view override returns (Request[] memory requests_) {
        return requests;
    }
}
