pragma solidity ^0.4.21;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/CentralizedExchangeBridge.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "../../assets/Asset.sol";
import "ds-math/math.sol";

contract CentralizedAdapter is ExchangeAdapterInterface, DBC, DSMath {

    // NON-CONSTANT METHODS

    // Responsibilities of makeOrder are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev These orders are not expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderValues [0] Maker token quantity
    /// @param orderValues [1] Taker token quantity
    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(Fund(this).owner() == msg.sender)
        pre_cond(!Fund(this).isShutDown())
    {
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());

        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        require(makeOrderPermitted(makerQuantity, makerAsset, takerQuantity, takerAsset));
        require(Asset(makerAsset).approve(targetExchange, makerQuantity));

        uint orderId = CentralizedExchangeBridge(targetExchange).makeOrder(
            makerAsset,
            takerAsset,
            makerQuantity,
            takerQuantity
        );

        require(
            Fund(this).isInAssetList(takerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addOpenMakeOrder(targetExchange, makerAsset, orderId);
        Fund(this).addAssetToOwnedAssets(takerAsset);
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
    }

    /// @dev Dummy function; not implemented on exchange
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        revert();
    }

    // responsibilities of cancelOrder are:
    // - check sender is this contract or owner, or that order expired
    // - remove order from tracking array
    // - cancel order on exchange
    /// @notice Cancels orders that were not expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Order maker asset
    /// @param identifier Order ID on the exchange
    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(Fund(this).owner() == msg.sender ||
                 Fund(this).isShutDown()          ||
                 Fund(this).orderExpired(targetExchange, orderAddresses[2])
        )
    {
        Fund(this).removeOpenMakeOrder(targetExchange, orderAddresses[2]);

        var (makerAsset, , makerQuantity,) = getOrder(targetExchange, uint(identifier));
        require(Asset(makerAsset).transferFrom(msg.sender, this, makerQuantity));
        require(Asset(makerAsset).approve(targetExchange, makerQuantity));
        require(CentralizedExchangeBridge(targetExchange).cancelOrder(uint(identifier)));
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.cancel,
            [address(0x0), address(0x0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // HELPER METHODS

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint makerQuantity,
        address makerAsset,
        uint takerQuantity,
        address takerAsset
    )
        internal
        view
        returns (bool) 
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        require(pricefeed.existsPriceOnAssetPair(makerAsset, takerAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(makerAsset, takerAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            makerAsset,
            takerAsset,
            makerQuantity,
            takerQuantity
        );
        return(
            riskmgmt.isMakePermitted(
                orderPrice,
                referencePrice,
                makerAsset,
                takerAsset,
                makerQuantity,
                takerQuantity
            )
        );
    }

    // VIEW FUNCTIONS

    function getOrder(
        address targetExchange,
        uint id
    ) 
        view
        returns (
            address makerAsset, address takerAsset,
            uint makerQuantity, uint takerQuantity
        )
    {
        (
            makerQuantity,
            makerAsset,
            takerQuantity,
            takerAsset
        ) = CentralizedExchangeBridge(targetExchange).getOrder(id);
    }
}
