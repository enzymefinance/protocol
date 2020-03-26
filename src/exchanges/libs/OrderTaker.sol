pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./OrderFiller.sol";
import "../../fund/policies/TradingSignatures.sol";
import "../../fund/policies/IPolicyManager.sol";

/// @title Order Taker base contract
/// @author Melonport AG <team@melonport.com>
abstract contract OrderTaker is OrderFiller, TradingSignatures {
    /// @notice Extract arguments for risk management validations
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return riskManagementAddresses needed addresses for risk management
    /// - [0] Maker address
    /// - [1] Taker address
    /// - [2] Maker asset
    /// - [3] Taker asset
    /// - [4] Maker fee asset
    /// - [5] Taker fee asset
    /// @return riskManagementValues needed values for risk management
    /// - [0] Maker asset amount
    /// - [1] Taker asset amount
    /// - [2] Taker asset fill amount
    function extractTakeOrderRiskManagementArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        virtual
        returns (address[6] memory, uint256[3] memory);

    /// @notice Perform a Take Order on a particular exchange
    /// @dev Synchronously handles the responsibilities of takeOrder:
    /// - Validate user inputs
    /// - Prepare a formatted list of assets and their expected fill amounts
    /// - Fill an order on the _targetExchange (with validateAndFinalizeFilledOrder)
    /// @param _targetExchange Order maker
    /// @param _encodedArgs Encoded parameters passed from client side
    function takeOrder (
        address _targetExchange,
        bytes memory _encodedArgs
    )
        public
    {
        (
            address[6] memory riskManagementAddresses,
            uint256[3] memory riskManagementValues
        ) = extractTakeOrderRiskManagementArgs(_targetExchange, _encodedArgs);

        IPolicyManager(__getRoutes().policyManager).preValidate(
            TAKE_ORDER,
            [
                riskManagementAddresses[0],
                riskManagementAddresses[1],
                riskManagementAddresses[2],
                riskManagementAddresses[3],
                _targetExchange
            ],
            riskManagementValues,
            0x0
        );

        __validateTakeOrderParams(
            _targetExchange,
            _encodedArgs
        );

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
            address[] memory fillApprovalTargets
        ) = __formatFillTakeOrderArgs(
            _targetExchange,
            _encodedArgs
        );

        __fillTakeOrder(
            _targetExchange,
            _encodedArgs,
            __encodeOrderFillData(fillAssets, fillExpectedAmounts, fillApprovalTargets)
        );

        IPolicyManager(__getRoutes().policyManager).postValidate(
            TAKE_ORDER,
            [
                riskManagementAddresses[0],
                riskManagementAddresses[1],
                riskManagementAddresses[2],
                riskManagementAddresses[3],
                _targetExchange
            ],
            riskManagementValues,
            0x0
        );
    }

    // INTERNAL FUNCTIONS

    /// @notice Reserved function for executing a take order on an external exchange
    /// @dev When executing your order, use the values in __fillAssets and __fillExpectedAmounts
    /// @dev Include the `validateAndFinalizeFilledOrder` modifier
    /// @param _fillData Encoded data used by the OrderFiller
    function __fillTakeOrder(
        address _targetExchange,
        bytes memory _encodedArgs,
        bytes memory _fillData
    )
        internal
        virtual;

    /// @notice Reserved function for formatting arrays of assets and their expected fill amounts
    /// @dev Pass the returned values as the final args for __fillTakeOrder()
    /// @return fillAssets_ Addresses of filled assets
    /// @return fillExpectedAmounts_ Expected amounts of asset fills
    /// @return fillApprovalTargets_ Targets to approve() for asset fills
    function __formatFillTakeOrderArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        virtual
        returns (
            address[] memory fillAssets_,
            uint256[] memory fillExpectedAmounts_,
            address[] memory fillApprovalTargets_
        );

    /// @notice Reserved function for validating the parameters of a takeOrder call
    /// @dev Use this to perform validation of takeOrder's inputs
    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        virtual;
}
