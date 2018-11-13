pragma solidity ^0.4.21;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/MatchingMarket.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "../../dependencies/math.sol";


/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is ExchangeAdapterInterface, DSMath, DBC {

    //  METHODS

    //  PUBLIC METHODS

    // Responsibilities of makeOrder are:
    // - check sender
    // - check fund not shut down
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev These orders are not expected to settle immediately
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());

        ERC20 makerAsset = ERC20(orderAddresses[2]);
        ERC20 takerAsset = ERC20(orderAddresses[3]);
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        // Remove invalid isInOpenMakeOrder entry
        Fund(address(this)).quantityHeldInCustodyOfExchange(address(makerAsset));

        require(!Fund(address(this)).isInOpenMakeOrder(makerAsset));
        require(makeOrderPermitted(makerQuantity, makerAsset, takerQuantity, takerAsset));
        require(makerAsset.approve(targetExchange, makerQuantity));

        uint orderId = MatchingMarket(targetExchange).offer(makerQuantity, makerAsset, takerQuantity, takerAsset);

        require(orderId != 0);   // defines success in MatchingMarket
        require(
            Fund(address(this)).isInAssetList(takerAsset) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        Fund(address(this)).addAssetToOwnedAssets(takerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(orderId),
            Fund.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
        Fund(address(this)).addOpenMakeOrder(targetExchange, makerAsset, orderId);
    }

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
    /// @notice Takes an active order on the selected exchange
    /// @dev These orders are expected to settle immediately
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());
        var (pricefeed,,) = Fund(address(this)).modules();
        uint fillTakerQuantity = orderValues[6];
        var (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = MatchingMarket(targetExchange).getOffer(uint(identifier));
        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(takerAsset != address(this) && makerAsset != address(this));
        require(address(makerAsset) != address(takerAsset));
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        require(fillMakerQuantity <= maxMakerQuantity);
        require(fillTakerQuantity <= maxTakerQuantity);

        require(takerAsset.approve(targetExchange, fillTakerQuantity));
        require(MatchingMarket(targetExchange).buy(uint(identifier), fillMakerQuantity));
        require(
            Fund(address(this)).isInAssetList(makerAsset) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        Fund(address(this)).addAssetToOwnedAssets(makerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.take,
            [address(makerAsset), address(takerAsset)],
            [maxMakerQuantity, maxTakerQuantity, fillTakerQuantity]
        );
    }

    // responsibilities of cancelOrder are:
    // - check sender is owner, or that order expired, or that fund shut down
    // - remove order from tracking array
    // - cancel order on exchange
    /// @notice Cancels orders that were not expected to settle immediately
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    )
        pre_cond(Fund(address(this)).owner() == msg.sender ||
                 Fund(address(this)).isShutDown()          ||
                 Fund(address(this)).orderExpired(targetExchange, orderAddresses[2])
        )
    {
        require(uint(identifier) != 0);

        var (, makerAsset, ,) = MatchingMarket(targetExchange).getOffer(uint(identifier));

        require(address(makerAsset) == orderAddresses[2]); // ensure we are checking correct asset

        Fund(address(this)).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // VIEW METHODS

    // TODO: delete this function if possible
    function getLastOrderId(address targetExchange)
        view
        returns (uint)
    {
        return MatchingMarket(targetExchange).last_offer_id();
    }

    // TODO: delete this function if possible
    function getOrder(address targetExchange, uint id, address makerAsset)
        view
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = MatchingMarket(targetExchange).getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }
}
