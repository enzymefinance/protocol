pragma solidity ^0.4.19;

import "../thirdparty/CentralizedExchangeBridge.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "../../assets/Asset.sol";
import "ds-math/math.sol";

contract CentralizedAdapter is DBC, DSMath {

    event OrderUpdated(address ofExchangeBridge, uint orderId);

    // NON-CONSTANT METHODS

    // Responsibilities of makeOrder are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev get/give is from maker's perspective
    /// @dev These orders are not expected to settle immediately
    /// @param orderAddresses [2] Asset to be sold (giveAsset)
    /// @param orderAddresses [3] Asset to be bought (getAsset)
    /// @param orderValues [0] Quantity of giveAsset to be sold
    /// @param orderValues [1] Quantity of getAsset to be bought
    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
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

        address giveAsset = orderAddresses[2];
        address getAsset = orderAddresses[3];
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];

        require(makeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset));
        require(Asset(giveAsset).approve(targetExchange, giveQuantity));

        uint orderId = CentralizedExchangeBridge(targetExchange).makeOrder(
            giveAsset,
            getAsset,
            giveQuantity,
            getQuantity
        );

        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addOpenMakeOrder(targetExchange, giveAsset, orderId);
        Fund(this).addAssetToOwnedAssets(getAsset);
        emit OrderUpdated(targetExchange, uint(orderId));
    }

    /// @dev Dummy function; not implemented yet
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
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
    /// @param orderAddresses [2] Asset for which we want to cancel an order
    /// @param identifier Order ID on the exchange
    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
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

        var (giveAsset, , giveQuantity,) = getOrder(targetExchange, uint(identifier));
        require(Asset(giveAsset).transferFrom(msg.sender, this, giveQuantity));
        require(Asset(giveAsset).approve(targetExchange, giveQuantity));
        require(CentralizedExchangeBridge(targetExchange).cancelOrder(uint(identifier)));
        emit OrderUpdated(targetExchange, uint(identifier));
    }

    // HELPER METHODS

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint giveQuantity,
        address giveAsset,
        uint getQuantity,
        address getAsset
    )
        internal
        view
        returns (bool) 
    {
        require(getAsset != address(this) && giveAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            giveAsset,
            getAsset,
            giveQuantity,
            getQuantity
        );
        return(
            riskmgmt.isMakePermitted(
                orderPrice,
                referencePrice,
                giveAsset,
                getAsset,
                giveQuantity,
                getQuantity
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
            address giveAsset, address getAsset,
            uint giveQuantity, uint getQuantity
        )
    {
        (
            giveQuantity,
            giveAsset,
            getQuantity,
            getAsset
        ) = CentralizedExchangeBridge(targetExchange).getOrder(id);
    }
}
