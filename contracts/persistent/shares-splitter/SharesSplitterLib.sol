// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IDispatcher} from "../dispatcher/IDispatcher.sol";
import {IGlobalConfig1} from "../global-config/interfaces/IGlobalConfig1.sol";
import {TreasurySplitterMixin} from "./TreasurySplitterMixin.sol";

/// @title SharesSplitterLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for a SharesSplitter
contract SharesSplitterLib is TreasurySplitterMixin {
    address internal constant NO_VALIDATION_DUMMY_ADDRESS = 0x000000000000000000000000000000000000aaaa;

    IGlobalConfig1 private immutable GLOBAL_CONFIG_CONTRACT;
    address private immutable INITIALIZER;

    constructor(address _globalConfigProxy, address _initializer) public {
        GLOBAL_CONFIG_CONTRACT = IGlobalConfig1(_globalConfigProxy);
        INITIALIZER = _initializer;
    }

    /// @notice Initializes the proxy
    /// @param _users The users to give a split percentage
    /// @param _splitPercentages The ordered split percentages corresponding to _users
    /// @dev Validating via INITIALIZER makes deployments cheaper than storing `bool initialized`,
    /// but INITIALIZER must be trusted to not call more than once.
    function init(address[] calldata _users, uint256[] calldata _splitPercentages) external {
        require(msg.sender == INITIALIZER, "init: Unauthorized");

        __setSplitRatio(_users, _splitPercentages);
    }

    /// @notice Claims and redeems shares as specified
    /// @param _vaultProxy The VaultProxy (shares token)
    /// @param _amount The desired amount of shares to claim and redeem
    /// @param _redeemContract The contract to call to redeem
    /// @param _redeemSelector The selector to call on _redeemContract
    /// @param _redeemData The encoded params with which to call _redeemSelector
    /// @return sharesRedeemed_ The number of shares redeemed
    function redeemShares(
        address _vaultProxy,
        uint256 _amount,
        address _redeemContract,
        bytes4 _redeemSelector,
        bytes calldata _redeemData
    ) external returns (uint256 sharesRedeemed_) {
        // Claim the shares tokens due to the user
        sharesRedeemed_ = __claimTokenWithoutTransfer(msg.sender, _vaultProxy, _amount);
        require(sharesRedeemed_ > 0, "redeemShares: No shares claimed");

        // Validate the redemption call after claiming, in order to pass the actual sharesRedeemed_
        // as the amount, and never max uint256, which could claim all shares in this contract.
        // No need to validate the recipient.
        require(
            GLOBAL_CONFIG_CONTRACT.isValidRedeemSharesCall(
                _vaultProxy, NO_VALIDATION_DUMMY_ADDRESS, sharesRedeemed_, _redeemContract, _redeemSelector, _redeemData
            ),
            "redeemShares: Invalid redeem call"
        );

        // Make validated redeem shares call
        (bool success, bytes memory returnData) = _redeemContract.call(abi.encodePacked(_redeemSelector, _redeemData));
        require(success, string(returnData));

        return sharesRedeemed_;
    }
}
