
pragma solidity ^0.4.21;

import "./thirdparty/kyber/KyberNetworkProxy.sol";
import "../dependencies/token/WETH9.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../../prices/CanonicalPriceFeed.sol";
import "../dependencies/DBC.sol";


contract KyberAdapter is DBC, DSMath {

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
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    )
    {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager is not sender");
        require(!hub.isShutDown(), "Hub is shut down");

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

        uint actualReceiveAmount = dispatchSwap(targetExchange, srcToken, srcAmount, destToken, destAmount);

        // TODO: Maybe post policy check for PriceTolernance based on actualReceiveAmount (Overkill maybe)
        require(
            Accounting(hub.accounting()).isInAssetList(destToken) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS()
        );

        // Add dest token to fund's owned asset list if not already exists and update order hook
        Accounting(hub.accounting()).addAssetToOwnedAssets(destToken);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.swap,
            [destToken, srcToken],
            [actualReceiveAmount, srcAmount, srcAmount]
        );
    }

    /// @dev Dummy function; not implemented on exchange
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        revert("Unimplemented");
    }

    /// @dev Dummy function; not implemented on exchange
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        revert("Unimplemented");
    }

    /// @dev Dummy function; not implemented on exchange
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    )
    {
        revert("Unimplemented");
    }

    // VIEW FUNCTIONS

    /// @dev Dummy function; not implemented on exchange
    function getOrder(
        address targetExchange,
        uint id,
        address makerAsset
    )
        view
        returns (address, address, uint, uint)
    {
        revert("Unimplemented");
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
        // TODO: Change to Native Asset or Wrapped Native Asset?
        address nativeAsset = Accounting(hub.accounting()).QUOTE_ASSET();
        
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
        Hub hub = Hub(Trading(address(this)).hub());
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
        // TODO: Change to more generic price source interface
        CanonicalPriceFeed pricefeed = CanonicalPriceFeed(Hub(Trading(address(this)).hub()).priceSource());
        minRate = pricefeed.getOrderPriceInfo(
            srcToken,
            destToken,
            srcAmount,
            destAmount
        );
    }
}
