pragma solidity ^0.4.21;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/0x/Exchange.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title ZeroExV1Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract ZeroExV1Adapter is ExchangeAdapterInterface, DSMath, DBC {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order not implemented for smart contracts in this exchange version
    function makeOrder(
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
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] Fee recipient
    /// @param orderValues [0] Maker token quantity
    /// @param orderValues [1] Taker token quantity
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] Expiration timestamp in seconds
    /// @param orderValues [5] Salt
    /// @param orderValues [6] Fill amount : amount of taker token to fill
    /// @param v ECDSA recovery id
    /// @param r ECDSA signature output r
    /// @param s ECDSA signature output s
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());

        Token makerAsset = Token(orderAddresses[2]);
        Token takerAsset = Token(orderAddresses[3]);
        uint maxMakerQuantity = orderValues[0];
        uint maxTakerQuantity = orderValues[1];
        uint fillTakerQuantity = orderValues[6];
        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(takeOrderPermitted(fillTakerQuantity, takerAsset, fillMakerQuantity, makerAsset));
        require(takerAsset.approve(Exchange(targetExchange).TOKEN_TRANSFER_PROXY_CONTRACT(), fillTakerQuantity));
        uint filledAmount = executeFill(targetExchange, orderAddresses, orderValues, fillTakerQuantity, v, r, s);
        require(filledAmount == fillTakerQuantity);
        require(
            Fund(this).isInAssetList(makerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addAssetToOwnedAssets(makerAsset);
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.take,
            [address(makerAsset), address(takerAsset)],
            [maxMakerQuantity, maxTakerQuantity, fillTakerQuantity]
        );
    }

    /// @notice Cancel is not implemented on exchange for smart contracts
    function cancelOrder(
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

    // TODO: delete this function if possible
    function getLastOrderId(address targetExchange)
        view
        returns (uint)
    {
        revert();
    }

    // TODO: delete this function if possible
    function getOrder(address targetExchange, uint id)
        view
        returns (address, address, uint, uint)
    {
        revert();
    }

    // INTERNAL METHODS

    /// @dev needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        uint fillTakerQuantity,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        internal
        returns (uint)
    {
        uint takerFee = orderValues[3];
        if (takerFee > 0) {
            Token zeroExToken = Token(Exchange(targetExchange).ZRX_TOKEN_CONTRACT());
            require(zeroExToken.approve(Exchange(targetExchange).TOKEN_TRANSFER_PROXY_CONTRACT(), takerFee));
        }

        return Exchange(targetExchange).fillOrder(
            orderAddresses,
            [
                orderValues[0], orderValues[1], orderValues[2],
                orderValues[3], orderValues[4], orderValues[5]
            ],
            fillTakerQuantity,
            false,
            v,
            r,
            s
        );
    }

    // VIEW METHODS

    /// @dev needed to avoid stack too deep error
    function takeOrderPermitted(
        uint takerQuantity,
        Token takerAsset,
        uint makerQuantity,
        Token makerAsset
    )
        internal
        view
        returns (bool)
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        require(address(makerAsset) != address(takerAsset));
        // require(fillTakerQuantity <= maxTakerQuantity);
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            takerQuantity,
            makerQuantity
        );
        return(
            riskmgmt.isTakePermitted(
                orderPrice,
                referencePrice,
                takerAsset,
                makerAsset,
                takerQuantity,
                makerQuantity
            )
        );
    }
}
