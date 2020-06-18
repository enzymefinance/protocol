// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "./OrderFiller.sol";

/// @title OrderTaker Base Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Base contract for taking an order on a particular exchange
abstract contract OrderTaker is OrderFiller {
    /// @notice Perform a Take Order on a particular exchange
    /// @dev Synchronously handles the responsibilities of takeOrder:
    /// - Validate user inputs
    /// - Prepare a formatted list of assets and their expected fill amounts
    /// - Fill an order (with validateAndFinalizeFilledOrder)
    /// @param _encodedArgs Encoded parameters passed from client side
    function takeOrder (bytes calldata _encodedArgs) external {
        __validateTakeOrderParams(_encodedArgs);

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
            address[] memory fillApprovalTargets
        ) = __formatFillTakeOrderArgs(_encodedArgs);

        __fillTakeOrder(
            _encodedArgs,
            __encodeOrderFillData(fillAssets, fillExpectedAmounts, fillApprovalTargets)
        );
    }

    // INTERNAL FUNCTIONS

    /// @notice Reserved function for executing a take order on an external exchange
    /// @dev When executing your order, use the values in __fillAssets and __fillExpectedAmounts
    /// @dev Include the `validateAndFinalizeFilledOrder` modifier
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @param _fillData Encoded data used by the OrderFiller
    function __fillTakeOrder(bytes memory _encodedArgs, bytes memory _fillData)
        internal
        virtual;

    /// @notice Reserved function for formatting arrays of assets and their expected fill amounts
    /// @dev Pass the returned values as the final args for __fillTakeOrder()
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return fillAssets_ Addresses of filled assets
    /// @return fillExpectedAmounts_ Expected amounts of asset fills
    /// @return fillApprovalTargets_ Targets to approve() for asset fills
    function __formatFillTakeOrderArgs(bytes memory _encodedArgs)
        internal
        view
        virtual
        returns (
            address[] memory fillAssets_,
            uint256[] memory fillExpectedAmounts_,
            address[] memory fillApprovalTargets_
        );

    /// @notice Reserved function for validating the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @dev Use this to perform validation of takeOrder's inputs
    function __validateTakeOrderParams(bytes memory _encodedArgs)
        internal
        view
        virtual;
}
