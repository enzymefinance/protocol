pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./OrderFiller.sol";

/// @title Order Taker base contract
/// @author Melonport AG <team@melonport.com>
abstract contract OrderTaker is OrderFiller {
    /// @notice Extract arguments for risk management validations
    /// @param _methodSelector method selector of TAKE_ORDER, ...
    /// @param _encodedArgs Encoded arguments for a specific exchange
    /// @notice rskMngAddrs [0] makerAddress
    /// @notice rskMngAddrs [1] takerAddress
    /// @notice rskMngAddrs [2] makerAsset
    /// @notice rskMngAddrs [3] takerAsset
    /// @notice rskMngAddrs [4] makerFeeAsset
    /// @notice rskMngAddrs [5] takerFeeAsset
    /// @notice rskMngVals [0] makerAssetAmount
    /// @notice rskMngVals [1] takerAssetAmount
    /// @notice rskMngVals [2] fillAmout
    function extractTakeOrderRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        pure
        virtual
        returns (address[6] memory, uint256[3] memory);

    /// @notice Perform a Take Order on a particular exchange
    /// @dev Synchronously handles the responsibilities of takeOrder:
    /// - Validate user inputs
    /// - Prepare a formatted list of assets and their expected fill amounts
    /// - Fill an order on the _targetExchange (with validateAndFinalizeFilledOrder)
    /// @param _targetExchange Order maker
    /// @param _orderAddresses [0] Order maker
    /// @param _orderAddresses [1] Order taker
    /// @param _orderAddresses [2] Order maker asset
    /// @param _orderAddresses [3] Order taker asset
    /// @param _orderAddresses [4] feeRecipientAddress
    /// @param _orderAddresses [5] senderAddress
    /// @param _orderAddresses [6] maker fee asset
    /// @param _orderAddresses [7] taker fee asset
    /// @param _orderValues [0] makerAssetAmount
    /// @param _orderValues [1] takerAssetAmount
    /// @param _orderValues [2] Maker fee
    /// @param _orderValues [3] Taker fee
    /// @param _orderValues [4] expirationTimeSeconds
    /// @param _orderValues [5] Salt/nonce
    /// @param _orderValues [6] Fill amount: amount of taker token to be traded
    /// @param _orderValues [7] Dexy signature mode
    /// @param _orderData [0] Encoded data specific to maker asset
    /// @param _orderData [1] Encoded data specific to taker asset
    /// @param _orderData [2] Encoded data specific to maker asset fee
    /// @param _orderData [3] Encoded data specific to taker asset fee
    /// @param _identifier Order identifier
    /// @param _signature Signature of order maker
    function takeOrder (
        address _targetExchange,
        bytes memory _encodedArgs
    )
        public
    {
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
