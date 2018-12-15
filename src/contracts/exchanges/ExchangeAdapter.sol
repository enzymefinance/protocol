pragma solidity ^0.4.21;

import "Accounting.sol";
import "Hub.sol";
import "Trading.sol";

/// @title Exchange Adapter base contract
/// @author Melonport AG <team@melonport.com>
/// @notice Override the public methods to implement an adapter
contract ExchangeAdapter {

    modifier onlyManager() {
        require(
            getManager() == msg.sender,
            "Manager must be sender"
        );
        _;
    }

    modifier notShutDown() {
        require(
            !hubShutDown(),
            "Hub must not be shut down"
        );
        _;
    }

    /// @dev Either manager sends, fund shut down, or order expired
    modifier onlyCancelPermitted(address exchange, address asset) {
        require(
            getManager() == msg.sender ||
            hubShutDown() ||
            getTrading().isOrderExpired(exchange, asset),
            "No cancellation condition met"
        );
        _;
    }

    function getTrading() internal view returns (Trading) {
        return Trading(address(this));
    }

    function getHub() internal view returns (Hub) {
        return Hub(getTrading().hub());
    }

    function getAccounting() internal view returns (Accounting) {
        return Accounting(getHub().accounting());
    }

    function hubShutDown() internal view returns (bool) {
        return getHub().isShutDown();
    }

    function getManager() internal view returns (address) {
        return getHub().manager();
    }

    function safeAddToOwnedAssets(address _asset) internal {
        require(
            getAccounting().isInAssetList(_asset) ||
            getAccounting().getOwnedAssetsLength() < getAccounting().MAX_OWNED_ASSETS(),
            "Max owned asset limit reached"
        );
        getAccounting().addAssetToOwnedAssets(_asset);
    }

    function ensureNotInOpenMakeOrder(address _asset) internal view {
        require(
            !getTrading().isInOpenMakeOrder(_asset),
            "This asset is already in an open make order"
        );
    }

    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] feeRecipientAddress
    /// @param orderAddresses [5] senderAddress
    /// @param orderValues [0] makerAssetAmount
    /// @param orderValues [1] takerAssetAmount
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] expirationTimeSeconds
    /// @param orderValues [5] Salt/nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param identifier Order identifier
    /// @param makerAssetData Encoded data specific to makerAsset
    /// @param takerAssetData Encoded data specific to takerAsset
    /// @param signature Signature of order maker

    // Responsibilities of makeOrder are:
    // - check sender
    // - check fund not shut down
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) { revert("Unimplemented"); }

    // Responsibilities of takeOrder are:
    // - check sender
    // - check fund not shut down
    // - check not buying own fund tokens
    // - check price exists for asset pair
    // - check price is recent
    // - check price passes risk management
    // - approve funds to be traded (if necessary)
    // - take order from the exchange
    // - check order was taken (if possible)
    // - place asset in ownedAssets if not already tracked
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) { revert("Unimplemented"); }

    // responsibilities of cancelOrder are:
    // - check sender is owner, or that order expired, or that fund shut down
    // - remove order from tracking array
    // - cancel order on exchange
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) { revert("Unimplemented"); }

    // PUBLIC METHODS
    // PUBLIC VIEW METHODS
    function getOrder(
        address onExchange,
        uint id,
        address makerAsset
    ) view returns (
        address,
        address,
        uint,
        uint
    ) { revert("Unimplemented"); }
}
