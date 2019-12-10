pragma solidity 0.5.15;
pragma experimental ABIEncoderV2;

import "../fund/accounting/Accounting.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";

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
        return Trading(address(uint160(address(this))));
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

    function ensureNotInOpenMakeOrder(address _asset) internal view {
        require(
            !getTrading().isInOpenMakeOrder(_asset),
            "This asset is already in an open make order"
        );
    }

    function ensureCanMakeOrder(address _asset) internal view {
        require(
            block.timestamp >= getTrading().makerAssetCooldown(_asset),
            "Cooldown for the maker asset not reached"
        );
    }

    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] feeRecipientAddress
    /// @param orderAddresses [5] senderAddress
    /// @param orderAddresses [6] maker fee asset
    /// @param orderAddresses [7] taker fee asset
    /// @param orderValues [0] makerAssetAmount
    /// @param orderValues [1] takerAssetAmount
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] expirationTimeSeconds
    /// @param orderValues [5] Salt/nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param orderData [0] Encoded data specific to maker asset
    /// @param orderData [1] Encoded data specific to taker asset
    /// @param orderData [2] Encoded data specific to maker asset fee
    /// @param orderData [3] Encoded data specific to taker asset fee
    /// @param identifier Order identifier
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
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public { revert("Unimplemented"); }

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
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public { revert("Unimplemented"); }

    // responsibilities of cancelOrder are:
    // - check sender is owner, or that order expired, or that fund shut down
    // - remove order from tracking array
    // - cancel order on exchange
    function cancelOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public { revert("Unimplemented"); }

    // PUBLIC METHODS
    // PUBLIC VIEW METHODS
    /*
    @return {
        "makerAsset": "Maker asset",
        "takerAsset": "Taker asset",
        "makerQuantity": "Amount of maker asset"
        "takerQuantity": "Amount of taker asset"
    }
    */
    function getOrder(
        address onExchange,
        uint id,
        address makerAsset
    ) public view returns (
        address,
        address,
        uint,
        uint
    ) { revert("Unimplemented"); }
}
