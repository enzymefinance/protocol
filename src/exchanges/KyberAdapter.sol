pragma solidity 0.5.15;

import "../dependencies/WETH.sol";
import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../prices/IPriceSource.sol";
import "./interfaces/IKyberNetworkProxy.sol";
import "./ExchangeAdapter.sol";

contract KyberAdapter is DSMath, ExchangeAdapter {
    address public constant ETH_TOKEN_ADDRESS = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    // NON-CONSTANT METHODS

    // Responsibilities of takeOrder (Kybers swapToken) are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - perform swap order on the exchange
    // - place asset in ownedAssets if not already tracked
    /// @notice Swaps srcAmount of srcToken for destAmount of destToken
    /// @dev Variable naming to be close to Kyber's naming
    /// @dev For the purpose of PriceTolerance, fillTakerQuantity == takerAssetQuantity = Dest token amount
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Maker asset (Dest token)
    /// @param orderAddresses [3] Taker asset (Src token)
    /// @param orderValues [0] Maker asset quantity (Dest token amount)
    /// @param orderValues [1] Taker asset quantity (Src token amount)
    function takeOrder(
        address targetExchange,
        address[6] memory orderAddresses,
        uint[8] memory orderValues,
        bytes32 identifier,
        bytes memory makerAssetData,
        bytes memory takerAssetData,
        bytes memory signature
    ) public onlyManager notShutDown {
        Hub hub = getHub();

        require(
            orderValues[1] == orderValues[6],
            "fillTakerQuantity must equal takerAssetQuantity"
        );

        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerAssetAmount = orderValues[0];
        uint takerAssetAmount = orderValues[1];

        uint minRate = calcMinRate(
            takerAsset,
            makerAsset,
            takerAssetAmount,
            makerAssetAmount
        );

        uint actualReceiveAmount = dispatchSwap(
            targetExchange, takerAsset, takerAssetAmount, makerAsset, minRate
        );
        require(
            actualReceiveAmount >= makerAssetAmount,
            "Received less than expected from Kyber swap"
        );

        getAccounting().addAssetToOwnedAssets(makerAsset);
        getAccounting().updateOwnedAssets();
        getTrading().returnAssetToVault(makerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [address(uint160(makerAsset)), address(uint160(takerAsset))],
            [actualReceiveAmount, takerAssetAmount, takerAssetAmount]
        );
    }

    // INTERNAL FUNCTIONS

    /// @notice Call different functions based on type of assets supplied
    function dispatchSwap(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address destToken,
        uint minRate
    )
        internal
        returns (uint actualReceiveAmount)
    {

        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        if (srcToken == nativeAsset) {
            actualReceiveAmount = swapNativeAssetToToken(targetExchange, nativeAsset, srcAmount, destToken, minRate);
        }
        else if (destToken == nativeAsset) {
            actualReceiveAmount = swapTokenToNativeAsset(targetExchange, srcToken, srcAmount, nativeAsset, minRate);
        }
        else {
            actualReceiveAmount = swapTokenToToken(targetExchange, srcToken, srcAmount, destToken, minRate);
        }
    }

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
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(nativeAsset, srcAmount);
        WETH(address(uint160(nativeAsset))).withdraw(srcAmount);
        receivedAmount = IKyberNetworkProxy(targetExchange).swapEtherToToken.value(srcAmount)(destToken, minRate);
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
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);
        IERC20(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = IKyberNetworkProxy(targetExchange).swapTokenToEther(srcToken, srcAmount, minRate);

        // Convert ETH to WETH
        WETH(address(uint160(nativeAsset))).deposit.value(receivedAmount)();
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
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);
        IERC20(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = IKyberNetworkProxy(targetExchange).swapTokenToToken(srcToken, srcAmount, destToken, minRate);
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
        IPriceSource pricefeed = IPriceSource(getHub().priceSource());
        minRate = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcAmount,
            destAmount
        );
    }
}
