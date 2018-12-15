pragma solidity ^0.4.21;

import "WETH9.sol";
import "Trading.sol";
import "Hub.sol";
import "Vault.sol";
import "Accounting.sol";
import "PriceSource.i.sol";
import "DBC.sol";
import "KyberNetworkProxy.sol";
import "ExchangeAdapter.sol";

contract KyberAdapter is DBC, DSMath, ExchangeAdapter {

    address public constant ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;

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
    /// @param orderAddresses [2] Src token
    /// @param orderAddresses [3] Dest token
    /// @param orderValues [0] Src token amount
    /// @param orderValues [1] Dest token amount
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) onlyManager notShutDown {
        Hub hub = getHub();
        require(
            orderValues[1] == orderValues[6],
            "fillTakerQuantity must equal takerAssetQuantity"
        );

        address srcToken = orderAddresses[2];
        address destToken = orderAddresses[3];
        uint srcAmount = orderValues[0];
        uint destAmount = orderValues[1];

        uint minRate = calcMinRate(
            srcToken,
            destToken,
            srcAmount,
            destAmount
        );

        uint actualReceiveAmount = dispatchSwap(targetExchange, srcToken, srcAmount, destToken, minRate);

        // TODO: Maybe post policy check for PriceTolerance based on actualReceiveAmount (Overkill maybe)
        require(
            Accounting(hub.accounting()).isInAssetList(destToken) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS(),
            "Too many assets in owned list"
        );

        // Add dest token to fund's owned asset list if not already exists and update order hook
        Accounting(hub.accounting()).addAssetToOwnedAssets(destToken);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [destToken, srcToken],
            [actualReceiveAmount, srcAmount, srcAmount]
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

        Hub hub = Hub(Trading(address(this)).hub());
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
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(nativeAsset, srcAmount);
        WETH9(nativeAsset).withdraw(srcAmount);
        receivedAmount = KyberNetworkProxy(targetExchange).swapEtherToToken.value(srcAmount)(ERC20Clone(destToken), minRate);
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
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);
        ERC20Clone(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToEther(ERC20Clone(srcToken), srcAmount, minRate);

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
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);
        ERC20Clone(srcToken).approve(targetExchange, srcAmount);
        receivedAmount = KyberNetworkProxy(targetExchange).swapTokenToToken(ERC20Clone(srcToken), srcAmount, ERC20Clone(destToken), minRate);
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
        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(this)).hub()).priceSource());
        minRate = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcAmount,
            destAmount
        );
    }
}
