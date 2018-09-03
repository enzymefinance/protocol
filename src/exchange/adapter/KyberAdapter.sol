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

    // Responsibilities of swapTokens are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - perform swap order on the exchange
    // - place asset in ownedAssets if not already tracked
    /// @notice Swaps srcAmount of srcToken for destAmount of destToken
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Src token
    /// @param orderAddresses [3] Dest token
    /// @param orderValues [0] Src token amount
    /// @param orderValues [1] Dest token amount
    function swapTokens(
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
        address srcToken = orderAddresses[2];
        address destToken = orderAddresses[3];
        uint srcQuantity = orderValues[0];
        uint destQuantity = orderValues[1];
        uint minRate = 0;
        uint actualReceiveQuantity;

        // If destQuantity is non-zero, set a minimum rate for the trade
        if (destQuantity != 0) {
            minRate = calcMinRate(
                srcToken,
                destToken,
                srcQuantity,
                destQuantity
            );
        }

        // Call different functions based on type of assets supplied
        if (srcToken == nativeAsset) {
            actualReceiveQuantity = swapNativeAssetToToken(targetExchange, nativeAsset, srcQuantity, destToken, minRate);
        }
        else if (destToken == nativeAsset) {
            actualReceiveQuantity = swapTokenToNativeAsset(targetExchange, srcToken, srcQuantity, nativeAsset, minRate);
        }
        else {
            actualReceiveQuantity = swapTokenToToken(targetExchange, srcToken, srcQuantity, destToken, minRate);
        }

        // Apply risk management (Post-trade basis)
        require(takeOrderPermitted(srcQuantity, srcToken, actualReceiveQuantity, destToken));
        require(
            Fund(address(this)).isInAssetList(destToken) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        // Add dest token to fund's owned asset list if not already exists and update order hook
        Fund(address(this)).addAssetToOwnedAssets(destToken);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(0),
            Fund.UpdateType.take,
            [address(destToken), address(srcToken)],
            [actualReceiveQuantity, srcQuantity, srcQuantity]
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
    /// @param nativeAsset Native asset address as src token
    /// @param srcQuantity Quantity of native asset supplied
    /// @param destToken Address of dest token
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
    /// @param srcToken Address of src token
    /// @param srcQuantity Quantity of src token supplied
    /// @param nativeAsset Native asset address as src token
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
    /// @param srcToken Address of src token
    /// @param srcQuantity Quantity of src token supplied
    /// @param destToken Address of dest token
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
    /// @param srcToken Address of src token
    /// @param destToken Address of dest token
    /// @param srcQuantity Quantity of src token
    /// @return destQuantity Quantity of dest token expected in return
    function calcMinRate(
        address srcToken,
        address destToken,
        uint srcQuantity,
        uint destQuantity
    )
        internal
        view
        returns (uint minRate)
    {
        var (pricefeed, , ,) = Fund(address(this)).modules();
        minRate = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcQuantity,
            destQuantity
        );
    }

    /// @dev Pre trade execution risk management check for minRate
    /// @param minPrice minPrice parameter to be supplied to Kyber proxy
    /// @param srcToken Address of src token
    /// @param destToken Address of dest token
    function isMinPricePermitted(
        uint minPrice,
        uint srcQuantity,
        address srcToken,
        address destToken
    )
        internal
        view
        returns (bool)
    {
        require(srcToken != address(this) && destToken != address(this));
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
        require(pricefeed.existsPriceOnAssetPair(srcToken, destToken));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(srcToken, destToken);
        require(isRecent);
        uint destQuantity = mul(minPrice, srcQuantity) / 10 ** pricefeed.getDecimals(destToken);
        return(
            riskmgmt.isTakePermitted(
                minPrice,
                referencePrice,
                srcToken,
                destToken,
                srcQuantity,
                destQuantity
            )
        );
    }

    /// @dev needed to avoid stack too deep error
    /// @param srcQuantity Quantity of src token supplied
    /// @param srcToken Address of src token
    /// @return destQuantity Quantity of dest token expected in return
    /// @param destToken Address of dest token
    function takeOrderPermitted(
        uint srcQuantity,
        address srcToken,
        uint destQuantity,
        address destToken
    )
        internal
        view
        returns (bool)
    {
        require(srcToken != address(this) && destToken != address(this));
        require(destToken != srcToken);
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
        require(pricefeed.existsPriceOnAssetPair(srcToken, destToken));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(srcToken, destToken);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcQuantity,
            destQuantity
        );
        return(
            riskmgmt.isTakePermitted(
                orderPrice,
                referencePrice,
                srcToken,
                destToken,
                srcQuantity,
                destQuantity
            )
        );
    }
}
