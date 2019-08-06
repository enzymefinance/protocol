pragma solidity ^0.4.25;

import "Weth.sol";
import "Trading.sol";
import "Hub.sol";
import "Vault.sol";
import "Accounting.sol";
import "UniswapFactoryInterface.sol";
import "UniswapExchangeInterface.sol";
import "ExchangeAdapter.sol";
import "ERC20.i.sol";


contract UniswapAdapter is DSMath, ExchangeAdapter {

    // NON-CONSTANT METHODS

    // Responsibilities of takeOrder are:
    // - approve funds to be traded (if necessary)
    // - perform swap order on the exchange
    // - place asset in ownedAssets if not already tracked
    /// @notice Swaps srcAmount of srcToken for a minimum of minDestAmount of destToken
    /// @dev For the purpose of PriceTolerance, fillTakerQuantity == takerAssetQuantity = Dest token amount
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Maker asset (Dest token)
    /// @param orderAddresses [3] Taker asset (Src token)
    /// @param orderValues [0] Maker asset quantity (Dest token amount)
    /// @param orderValues [1] Taker asset quantity (Src token amount)
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
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

        uint actualReceiveAmount = dispatchSwap(
            targetExchange, takerAsset, takerAssetAmount, makerAsset, makerAssetAmount
        );
        require(
            actualReceiveAmount >= makerAssetAmount,
            "Received less than expected from Uniswap exchange"
        );

        getAccounting().addAssetToOwnedAssets(makerAsset);
        getAccounting().updateOwnedAssets();
        getTrading().returnAssetToVault(makerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [makerAsset, takerAsset],
            [actualReceiveAmount, takerAssetAmount, takerAssetAmount]
        );
    }

    // PUBLIC VIEW FUNCTIONS

    /// @dev This is different from Uniswap's Input Price functions because Uniswap functions return the quantity instead of the rate
    /// @notice Calculates the Uniswap rates between tokens for the srcAmount
    function getInputRate(
        address targetExchange,
        address nativeAsset,
        address srcToken,
        uint srcAmount,
        address destToken
    )
        public view
        returns (uint inputRate)
    {
        require(
            srcToken != destToken,
            "Src token cannot be the same as dest token"
        );

        address tokenExchange;
        uint expectedDestAmount;
        if (srcToken == nativeAsset) {

            tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(destToken);
            expectedDestAmount = UniswapExchangeInterface(tokenExchange).getEthToTokenInputPrice(srcAmount);

        } else if (destToken == nativeAsset) {

            tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(srcToken);
            expectedDestAmount = UniswapExchangeInterface(tokenExchange).getTokenToEthInputPrice(srcAmount);

        } else {

            address intermediateTokenExchange = UniswapFactoryInterface(targetExchange).getExchange(srcToken);
            uint intermediateEthBought = UniswapExchangeInterface(intermediateTokenExchange).getTokenToEthInputPrice(srcAmount);
            tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(destToken);
            expectedDestAmount = UniswapExchangeInterface(tokenExchange).getEthToTokenInputPrice(intermediateEthBought);

        }

        inputRate = mul(expectedDestAmount, 10 ** uint(ERC20WithFields(srcToken).decimals())) / srcAmount;
    }

    // INTERNAL FUNCTIONS

    /// @notice Call different functions based on type of assets supplied
    function dispatchSwap(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address destToken,
        uint minDestAmount
    )
        internal
        returns (uint actualReceiveAmount)
    {
        require(
            srcToken != destToken,
            "Src token cannot be the same as dest token"
        );

        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        if (srcToken == nativeAsset) {
            actualReceiveAmount = swapNativeAssetToToken(
                targetExchange,
                nativeAsset,
                srcAmount,
                destToken,
                minDestAmount
            );
        } else if (destToken == nativeAsset) {
            actualReceiveAmount = swapTokenToNativeAsset(
                targetExchange,
                srcToken,
                srcAmount,
                nativeAsset,
                minDestAmount
            );
        } else {
            actualReceiveAmount = swapTokenToToken(
                targetExchange,
                srcToken,
                srcAmount,
                destToken,
                minDestAmount
            );
        }
    }

    /// @param targetExchange Address of Uniswap factory contract
    /// @param nativeAsset Native asset address as src token
    /// @param srcAmount Amount of native asset supplied
    /// @param destToken Address of dest token
    /// @param minDestAmount Minimum amount of minimum dest token to get back
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapNativeAssetToToken(
        address targetExchange,
        address nativeAsset,
        uint srcAmount,
        address destToken,
        uint minDestAmount
    )
        internal
        returns (uint receivedAmount)
    {
        // Convert WETH to ETH
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(nativeAsset, srcAmount);
        WETH(nativeAsset).withdraw(srcAmount);

        address tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(destToken);
        receivedAmount = UniswapExchangeInterface(tokenExchange).ethToTokenSwapInput.value(srcAmount)(minDestAmount, add(block.timestamp, 1));
    }

    /// @param targetExchange Address of Uniswap factory contract
    /// @param srcToken Address of src token
    /// @param srcAmount Amount of src token supplied
    /// @param nativeAsset Native asset address as src token
    /// @param minDestAmount Minimum amount of minimum dest token to get back
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapTokenToNativeAsset(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address nativeAsset,
        uint minDestAmount
    )
        internal
        returns (uint receivedAmount)
    {
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);

        address tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(srcToken);
        ERC20(srcToken).approve(tokenExchange, srcAmount);
        receivedAmount = UniswapExchangeInterface(tokenExchange).tokenToEthSwapInput(srcAmount, minDestAmount, add(block.timestamp, 1));

        // Convert ETH to WETH
        WETH(nativeAsset).deposit.value(receivedAmount)();
    }

    /// @param targetExchange Address of Uniswap factory contract
    /// @param srcToken Address of src token
    /// @param srcAmount Amount of src token supplied
    /// @param destToken Address of dest token
    /// @param minDestAmount Minimum amount of minimum dest token to get back
    /// @return receivedAmount Actual amount of destToken received from the exchange
    function swapTokenToToken(
        address targetExchange,
        address srcToken,
        uint srcAmount,
        address destToken,
        uint minDestAmount
    )
        internal
        returns (uint receivedAmount)
    {
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(srcToken, srcAmount);

        address tokenExchange = UniswapFactoryInterface(targetExchange).getExchange(srcToken);
        ERC20(srcToken).approve(tokenExchange, srcAmount);
        // TODO: Better way of passing min_eth_bought parameter instead of passing a hardcoded '1'
        receivedAmount = UniswapExchangeInterface(tokenExchange).tokenToTokenSwapInput(
            srcAmount, minDestAmount, 1, add(block.timestamp, 1), destToken
        );
    }
}
