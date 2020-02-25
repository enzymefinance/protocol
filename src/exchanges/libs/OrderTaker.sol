pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./OrderFiller.sol";

/// @title Order Taker base contract
/// @author Melonport AG <team@melonport.com>
abstract contract OrderTaker is OrderFiller {
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
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
    {
        __validateTakeOrderParams(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature
        );

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = __formatFillTakeOrderArgs(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature
        );

        __fillTakeOrder(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature,
            fillAssets,
            fillExpectedAmounts
        );
    }

    // INTERNAL FUNCTIONS
 
    /// @notice Reserved function for executing a take order on an external exchange
    /// @dev When executing your order, use the values in __fillAssets and __fillExpectedAmounts
    /// @dev Include the `validateAndFinalizeFilledOrder` modifier
    /// @param _fillAssets Addresses of assets to be filled, from __formatFillTakeOrderArgs
    /// @param _fillExpectedAmounts Expected fill amounts, relative to each fillAssets, from __formatFillTakeOrderArgs
    function __fillTakeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        virtual;

    /// @notice Reserved function for formatting arrays of assets and their expected fill amounts
    /// @dev Pass the returned values as the final args for __fillTakeOrder()
    /// @return fillAssets_ Addresses of filled assets
    /// @return fillExpectedAmounts_ Expected amounts of asset fills
    function __formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        virtual
        returns (address[] memory fillAssets_, uint256[] memory fillExpectedAmounts_);

    /// @notice Reserved function for validating the parameters of a takeOrder call
    /// @dev Use this to perform validation of takeOrder's inputs
    function __validateTakeOrderParams(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        virtual;
}
