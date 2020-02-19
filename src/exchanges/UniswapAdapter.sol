pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../dependencies/WETH.sol";
import "../fund/accounting/Accounting.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "./interfaces/IUniswapFactory.sol";
import "./interfaces/IUniswapExchange.sol";
import "./ExchangeAdapter.sol";

contract UniswapAdapter is DSMath, ExchangeAdapter {
    /// @notice Take order that uses a user-defined src token amount to trade for a dest token amount
    /// @dev For the purpose of PriceTolerance, _orderValues [1] == _orderValues [6] = Dest token amount
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _orderAddresses [2] Maker asset (Dest token)
    /// @param _orderAddresses [3] Taker asset (Src token)
    /// @param _orderValues [0] Maker asset quantity (Dest token amount)
    /// @param _orderValues [1] Taker asset quantity (Src token amount)
    /// @param _orderValues [6] Taker asset fill amount
    function takeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        onlyManager
        notShutDown
    {
        Hub hub = getHub();

        require(
            _orderValues[1] == _orderValues[6],
            "Taker asset amount must equal taker asset fill amount"
        );

        address makerAsset = _orderAddresses[2];
        address takerAsset = _orderAddresses[3];
        uint makerAssetAmount = _orderValues[0];
        uint takerAssetAmount = _orderValues[1];

        uint actualReceiveAmount = dispatchSwap(
            _targetExchange, takerAsset, takerAssetAmount, makerAsset, makerAssetAmount
        );
        require(
            actualReceiveAmount >= makerAssetAmount,
            "Received less than expected from Uniswap exchange"
        );

        updateStateTakeOrder(
            _targetExchange,
            makerAsset,
            takerAsset,
            takerAssetAmount,
            actualReceiveAmount
        );
    }

    // INTERNAL FUNCTIONS

    /// @notice Call different functions based on type of assets supplied
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _srcToken Address of src token
    /// @param _srcAmount Amount of src token supplied
    /// @param _destToken Address of dest token
    /// @param _minDestAmount Minimum amount of dest token to receive
    /// @return actualReceiveAmount_ Actual amount of _destToken received
    function dispatchSwap(
        address _targetExchange,
        address _srcToken,
        uint _srcAmount,
        address _destToken,
        uint _minDestAmount
    )
        internal
        returns (uint actualReceiveAmount_)
    {
        require(
            _srcToken != _destToken,
            "Src token cannot be the same as dest token"
        );

        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        if (_srcToken == nativeAsset) {
            actualReceiveAmount_ = swapNativeAssetToToken(
                _targetExchange,
                nativeAsset,
                _srcAmount,
                _destToken,
                _minDestAmount
            );
        } else if (_destToken == nativeAsset) {
            actualReceiveAmount_ = swapTokenToNativeAsset(
                _targetExchange,
                _srcToken,
                _srcAmount,
                nativeAsset,
                _minDestAmount
            );
        } else {
            actualReceiveAmount_ = swapTokenToToken(
                _targetExchange,
                _srcToken,
                _srcAmount,
                _destToken,
                _minDestAmount
            );
        }
    }

    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _nativeAsset Native asset address as src token
    /// @param _srcAmount Amount of native asset supplied
    /// @param _destToken Address of dest token
    /// @param _minDestAmount Minimum amount of dest token to get back
    /// @return actualReceiveAmount_ Actual amount of _destToken received
    function swapNativeAssetToToken(
        address _targetExchange,
        address _nativeAsset,
        uint _srcAmount,
        address _destToken,
        uint _minDestAmount
    )
        internal
        returns (uint actualReceiveAmount_)
    {
        // Convert WETH to ETH
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(_nativeAsset, _srcAmount);
        WETH(payable(_nativeAsset)).withdraw(_srcAmount);

        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_destToken);
        actualReceiveAmount_ = IUniswapExchange(tokenExchange).ethToTokenTransferInput.value(
            _srcAmount
        )
        (
            _minDestAmount,
            add(block.timestamp, 1),
            address(vault)
        );
    }

    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _srcToken Address of src token
    /// @param _srcAmount Amount of src token supplied
    /// @param _nativeAsset Native asset address as dest token
    /// @param _minDestAmount Minimum amount of dest token to get back
    /// @return actualReceiveAmount_ Actual amount of _destToken received
    function swapTokenToNativeAsset(
        address _targetExchange,
        address _srcToken,
        uint _srcAmount,
        address _nativeAsset,
        uint _minDestAmount
    )
        internal
        returns (uint actualReceiveAmount_)
    {
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(_srcToken, _srcAmount);

        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_srcToken);
        approveAsset(_srcToken, tokenExchange, _srcAmount, "takerAsset");
        actualReceiveAmount_ = IUniswapExchange(tokenExchange).tokenToEthSwapInput(
            _srcAmount,
            _minDestAmount,
            add(block.timestamp, 1)
        );

        // Convert ETH to WETH and move to Vault
        WETH(payable(_nativeAsset)).deposit.value(actualReceiveAmount_)();
        uint256 timesNativeAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(_nativeAsset);
        if (
            !getTrading().isInOpenMakeOrder(_nativeAsset) &&
            timesNativeAssetUsedAsFee == 0
        ) {
            getTrading().returnAssetToVault(_nativeAsset);
        }
    }

    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _srcToken Address of src token
    /// @param _srcAmount Amount of src token supplied
    /// @param _destToken Address of dest token
    /// @param _minDestAmount Minimum amount of dest token to get back
    /// @return actualReceiveAmount_ Actual amount of _destToken received
    function swapTokenToToken(
        address _targetExchange,
        address _srcToken,
        uint _srcAmount,
        address _destToken,
        uint _minDestAmount
    )
        internal
        returns (uint actualReceiveAmount_)
    {
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(_srcToken, _srcAmount);

        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_srcToken);
        approveAsset(_srcToken, tokenExchange, _srcAmount, "takerAsset");
        actualReceiveAmount_ = IUniswapExchange(tokenExchange).tokenToTokenTransferInput(
            _srcAmount,
            _minDestAmount,
            1,
            add(block.timestamp, 1),
            address(vault),
            _destToken
        );
    }

    function updateStateTakeOrder(
        address _targetExchange,
        address _makerAsset,
        address _takerAsset,
        uint256 _takerAssetAmount,
        uint256 _actualReceiveAmount
    )
        internal
    {
        getAccounting().addAssetToOwnedAssets(_makerAsset);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            _targetExchange,
            bytes32(0),
            Trading.UpdateType.take,
            [payable(_makerAsset), payable(_takerAsset)],
            [_actualReceiveAmount, _takerAssetAmount, _takerAssetAmount]
        );
    }
}
