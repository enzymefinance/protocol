pragma solidity ^0.4.21;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/kyber/KyberNetworkProxy.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "../../assets/Asset.sol";
import "../../assets/WETH9.sol";
import "../../dependencies/math.sol";

contract KyberAdapter is ExchangeAdapterInterface, DBC, DSMath {

    address public constant ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;

    // NON-CONSTANT METHODS

    // Responsibilities of takeOrder are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev These orders are not expected to settle immediately
    /// @dev srcToken == takerAsset, destToken = makerAsset
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderValues [0] Maker token quantity
    /// @param orderValues [1] Taker token quantity
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
    {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());

        address nativeAsset = Fund(address(this)).NATIVE_ASSET();
        address takerAsset = orderAddresses[2];
        address makerAsset = orderAddresses[3];
        uint takerQuantity = orderValues[0];
        uint makerQuantity = orderValues[1];
        uint minRate = 0;
        uint actualReceiveQuantity;

        // If makerQuantity is non-zero, set a minimum rate for the trade
        if (makerQuantity != 0) {
            minRate = calcMinRate(
                takerAsset,
                makerAsset,
                takerQuantity,
                makerQuantity
            );
        }

        // Call different functions based on type of assets supplied
        if (takerAsset == nativeAsset) {
            actualReceiveQuantity = swapNativeAssetToToken(targetExchange, nativeAsset, takerQuantity, makerAsset, minRate);
        }
        else if (makerAsset == nativeAsset) {
            actualReceiveQuantity = swapTokenToNativeAsset(targetExchange, takerAsset, takerQuantity, nativeAsset, minRate);
        }
        else {
            actualReceiveQuantity = swapTokenToToken(targetExchange, takerAsset, takerQuantity, makerAsset, minRate);
        }

        // Apply risk management (Post-trade basis)
        require(takeOrderPermitted(takerQuantity, takerAsset, actualReceiveQuantity, makerAsset));
        require(
            Fund(address(this)).isInAssetList(makerAsset) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        // Add taker asset to fund's owned asset list if not already exists and update order hook
        Fund(address(this)).addAssetToOwnedAssets(makerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(0),
            Fund.UpdateType.take,
            [address(makerAsset), address(takerAsset)],
            [actualReceiveQuantity, takerQuantity, takerQuantity]
        );
    }

    /// @dev Dummy function; not implemented on exchange
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

    /// @dev Dummy function; not implemented on exchange
    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
    {
        revert();
    }

    // VIEW FUNCTIONS

    /// @dev Dummy function; not implemented on exchange
    function getOrder(
        address targetExchange,
        uint id
    )
        view
        returns (address, address, uint, uint)
    {
        revert();
    }

    // INTERNAL FUNCTIONS

    /// @dev If minRate is not defined, uses expected rate from the network
    /// @param targetExchange Address of Kyber proxy contract
    /// @param nativeAsset Native asset address as maker asset
    /// @param srcQuantity Quantity of native asset supplied
    /// @param destToken Address of taker asset
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual quantity of destToken received from the exchange
    function swapNativeAssetToToken(
        address targetExchange,
        address nativeAsset,
        uint srcQuantity,
        address destToken,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        // Convert WETH to ETH
        WETH9(nativeAsset).withdraw(srcQuantity);

        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(ETH_TOKEN_ADDRESS), ERC20(destToken), srcQuantity);
        require(isMinPricePermitted(minRate, srcQuantity, nativeAsset, destToken));
        receivedAmount = KyberNetworkProxy(targetExchange).swapEtherToToken.value(srcQuantity)(ERC20(destToken), minRate);
    }

    /// @dev If minRate is not defined, uses expected rate from the network
    /// @param targetExchange Address of Kyber proxy contract
    /// @param srcToken Address of maker asset
    /// @param srcQuantity Quantity of maker asset supplied
    /// @param nativeAsset Native asset address as taker asset
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual quantity of destToken received from the exchange
    function swapTokenToNativeAsset(
        address targetExchange,
        address srcToken,
        uint srcQuantity,
        address nativeAsset,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(srcToken), ERC20(ETH_TOKEN_ADDRESS), srcQuantity);
        require(isMinPricePermitted(minRate, srcQuantity, srcToken, nativeAsset));
        ERC20(srcToken).approve(targetExchange, srcQuantity);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToEther(ERC20(srcToken), srcQuantity, minRate);

        // Convert ETH to WETH
        WETH9(nativeAsset).deposit.value(receivedAmount)();
    }

    /// @dev If minRate is not defined, uses expected rate from the network
    /// @param targetExchange Address of Kyber proxy contract
    /// @param srcToken Address of maker asset
    /// @param srcQuantity Quantity of maker asset supplied
    /// @param destToken Address of taker asset
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual quantity of destToken received from the exchange
    function swapTokenToToken(
        address targetExchange,
        address srcToken,
        uint srcQuantity,
        address destToken,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(srcToken), ERC20(destToken), srcQuantity);
        //require(isMinPricePermitted(minRate, srcQuantity, srcToken, destToken));
        ERC20(srcToken).approve(targetExchange, srcQuantity);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToToken(ERC20(srcToken), srcQuantity, ERC20(destToken), minRate);
    }

    /// @dev Calculate min rate to be supplied to the network based on provided order parameters
    /// @param makerAsset Address of maker asset
    /// @param takerAsset Address of taker asset
    /// @param makerQuantity Quantity of maker asset supplied
    /// @return takerQuantity Quantity of taker asset expected in return
    function calcMinRate(
        address takerAsset,
        address makerAsset,
        uint takerQuantity,
        uint makerQuantity
    )
        internal
        view
        returns (uint minRate)
    {
        var (pricefeed, , ,) = Fund(address(this)).modules();
        minRate = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            takerQuantity,
            makerQuantity
        );
    }

    /// @dev Pre trade execution risk management check for minRate
    /// @param minPrice minPrice parameter to be supplied to Kyber proxy
    /// @param takerAsset Address of maker asset
    /// @param makerAsset Address of taker asset
    function isMinPricePermitted(
        uint minPrice,
        uint takerQuantity,
        address takerAsset,
        address makerAsset
    )
        internal
        view
        returns (bool)
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);
        require(isRecent);
        uint makerQuantity = mul(minPrice, takerQuantity) / 10 ** pricefeed.getDecimals(makerAsset);
        return(
            riskmgmt.isTakePermitted(
                minPrice,
                referencePrice,
                takerAsset,
                makerAsset,
                takerQuantity,
                makerQuantity
            )
        );
    }

    /// @dev needed to avoid stack too deep error
    /// @param takerQuantity Quantity of maker asset supplied
    /// @param takerAsset Address of maker asset
    /// @return makerQuantity Quantity of taker asset expected in return
    /// @param makerAsset Address of taker asset
    function takeOrderPermitted(
        uint takerQuantity,
        address takerAsset,
        uint makerQuantity,
        address makerAsset
    )
        internal
        view
        returns (bool)
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        require(makerAsset != takerAsset);
        // require(fillTakerQuantity <= maxTakerQuantity);
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
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
