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
    /// @dev Variable naming to be close to Kyber's naming
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
        uint srcAmount = orderValues[0];
        uint destAmount = orderValues[1];
        uint minRate = 0;
        uint actualReceiveAmount;

        // If destAmount is non-zero, set a minimum rate for the trade
        if (destAmount != 0) {
            minRate = calcMinRate(
                srcToken,
                destToken,
                srcAmount,
                destAmount
            );
        }

        // Call different functions based on type of assets supplied
        if (srcToken == nativeAsset) {
            actualReceiveAmount = swapNativeAssetToToken(targetExchange, nativeAsset, srcAmount, destToken, minRate);
        }
        else if (destToken == nativeAsset) {
            actualReceiveAmount = swapTokenToNativeAsset(targetExchange, srcToken, srcAmount, nativeAsset, minRate);
        }
        else {
            actualReceiveAmount = swapTokenToToken(targetExchange, srcToken, srcAmount, destToken, minRate);
        }

        // Apply risk management (Post-trade basis)
        require(swapPermitted(srcAmount, srcToken, actualReceiveAmount, destToken));
        require(
            Fund(address(this)).isInAssetList(destToken) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        // Add dest token to fund's owned asset list if not already exists and update order hook
        Fund(address(this)).addAssetToOwnedAssets(destToken);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(0),
            Fund.UpdateType.swap,
            [address(destToken), address(srcToken)],
            [actualReceiveAmount, srcAmount, srcAmount]
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
    /// @param srcAmount Amount of native asset supplied
    /// @param destToken Address of dest token
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapNativeAssetToToken(
        address targetExchange,
        address nativeAsset,
        uint srcAmount,
        address destToken,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        // Convert WETH to ETH
        WETH9(nativeAsset).withdraw(srcAmount);

        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(ETH_TOKEN_ADDRESS), ERC20(destToken), srcAmount);
        require(isMinPricePermitted(minRate, srcAmount, nativeAsset, destToken));
        receivedAmount = KyberNetworkProxy(targetExchange).swapEtherToToken.value(srcAmount)(ERC20(destToken), minRate);
    }

    /// @dev If minRate is not defined, uses expected rate from the network
    /// @param targetExchange Address of Kyber proxy contract
    /// @param srcToken Address of src token
    /// @param srcAmount Amount of src token supplied
    /// @param nativeAsset Native asset address as src token
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapTokenToNativeAsset(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address nativeAsset,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(srcToken), ERC20(ETH_TOKEN_ADDRESS), srcAmount);
        require(isMinPricePermitted(minRate, srcAmount, srcToken, nativeAsset));
        ERC20(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToEther(ERC20(srcToken), srcAmount, minRate);

        // Convert ETH to WETH
        WETH9(nativeAsset).deposit.value(receivedAmount)();
    }

    /// @dev If minRate is not defined, uses expected rate from the network
    /// @param targetExchange Address of Kyber proxy contract
    /// @param srcToken Address of src token
    /// @param srcAmount Amount of src token supplied
    /// @param destToken Address of dest token
    /// @param minRate Minimum rate supplied to the Kyber proxy
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapTokenToToken(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address destToken,
        uint minRate
    )
        internal
        returns (uint receivedAmount)
    {
        if (minRate == 0) (, minRate) = KyberNetworkProxy(targetExchange).getExpectedRate(ERC20(srcToken), ERC20(destToken), srcAmount);
        require(isMinPricePermitted(minRate, srcAmount, srcToken, destToken));
        ERC20(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToToken(ERC20(srcToken), srcAmount, ERC20(destToken), minRate);
    }

    /// @dev Calculate min rate to be supplied to the network based on provided order parameters
    /// @param srcToken Address of src token
    /// @param destToken Address of dest token
    /// @param srcAmount Amount of src token
    /// @return destAmount Amount of dest token expected in return
    function calcMinRate(
        address srcToken,
        address destToken,
        uint srcAmount,
        uint destAmount
    )
        internal
        view
        returns (uint minRate)
    {
        var (pricefeed, , ,) = Fund(address(this)).modules();
        minRate = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcAmount,
            destAmount
        );
    }

    /// @dev Pre trade execution risk management check for minRate
    /// @param minPrice minPrice parameter to be supplied to Kyber proxy
    /// @param srcToken Address of src token
    /// @param destToken Address of dest token
    function isMinPricePermitted(
        uint minPrice,
        uint srcAmount,
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
        uint destAmount = mul(minPrice, srcAmount) / 10 ** pricefeed.getDecimals(destToken);
        return(
            riskmgmt.isTakePermitted(
                minPrice,
                referencePrice,
                srcToken,
                destToken,
                srcAmount,
                destAmount
            )
        );
    }

    /// @dev needed to avoid stack too deep error
    /// @param srcAmount Amount of src token supplied
    /// @param srcToken Address of src token
    /// @return destAmount Amount of dest token expected in return
    /// @param destToken Address of dest token
    function swapPermitted(
        uint srcAmount,
        address srcToken,
        uint destAmount,
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
            srcAmount,
            destAmount
        );
        return(
            riskmgmt.isTakePermitted(
                orderPrice,
                referencePrice,
                srcToken,
                destToken,
                srcAmount,
                destAmount
            )
        );
    }
}
