// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../libs/OrderTaker.sol";
import "../libs/decoders/MinimalTakeOrderDecoder.sol";
import "../interfaces/IUniswapFactory.sol";
import "../interfaces/IUniswapExchange.sol";
import "../../dependencies/WETH.sol";

/// @title UniswapAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter between Melon and Uniswap
contract UniswapAdapter is OrderTaker, MinimalTakeOrderDecoder {
    address immutable public EXCHANGE;

    constructor(address _exchange) public {
        EXCHANGE = _exchange;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "UNISWAP_V1";
    }

    /// @notice Extract arguments for risk management validations of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return riskManagementAddresses_ needed addresses for risk management
    /// - [0] Maker address
    /// - [1] Taker address
    /// - [2] Maker asset
    /// - [3] Taker asset
    /// - [4] Maker fee asset
    /// - [5] Taker fee asset
    /// @return riskManagementValues_ needed values for risk management
    /// - [0] Maker asset amount
    /// - [1] Taker asset amount
    /// - [2] Taker asset fill amount
    function __extractTakeOrderRiskManagementArgs(bytes memory _encodedArgs)
        internal
        view
        override
        returns (address[6] memory riskManagementAddresses_, uint256[3] memory riskManagementValues_)
    {
        (
            address makerAsset,
            uint256 makerQuantity,
            address takerAsset,
            uint256 takerQuantity
        ) = __decodeTakeOrderArgs(_encodedArgs);

        riskManagementAddresses_ = [
            address(0),
            address(this),
            makerAsset,
            takerAsset,
            address(0),
            address(0)
        ];
        riskManagementValues_ = [
            makerQuantity,
            takerQuantity,
            takerQuantity
        ];
    }

    /// @notice Take a market order on Uniswap (takeOrder)
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(bytes memory _encodedArgs, bytes memory _fillData)
        internal
        override
        validateAndFinalizeFilledOrder(_fillData)
    {
        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
        ) = __decodeOrderFillData(_fillData);

        if (fillAssets[1] == __getNativeAssetAddress()) {
            __swapNativeAssetToToken(fillAssets, fillExpectedAmounts);
        }
        else if (fillAssets[0] == __getNativeAssetAddress()) {
            __swapTokenToNativeAsset(fillAssets, fillExpectedAmounts);
        }
        else {
            __swapTokenToToken(fillAssets, fillExpectedAmounts);
        }
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return fillAssets_ Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return fillExpectedAmounts_ Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return fillApprovalTargets_ Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Uniswap exchange of taker asset
    function __formatFillTakeOrderArgs(bytes memory _encodedArgs)
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            address makerAsset,
            uint256 makerQuantity,
            address takerAsset,
            uint256 takerQuantity
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = makerAsset;
        fillAssets[1] = takerAsset;

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = makerQuantity;
        fillExpectedAmounts[1] = takerQuantity;

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = fillAssets[1] == __getNativeAssetAddress() ?
            address(0) :
            IUniswapFactory(EXCHANGE).getExchange(fillAssets[1]); // Uniswap exchange of taker asset

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    function __validateTakeOrderParams(bytes memory _encodedArgs)
        internal
        view
        override
    {
        (
            address makerAsset,
            ,
            address takerAsset
            ,
        ) = __decodeTakeOrderArgs(_encodedArgs);

        IRegistry registry = __getRegistry();
        require(registry.primitiveIsRegistered(
            makerAsset), 'Maker asset not registered'
        );
        require(registry.primitiveIsRegistered(
            takerAsset), 'Taker asset not registered'
        );
    }

    // PRIVATE FUNCTIONS

    /// @notice Executes a swap of ETH (taker) to ERC20 (maker)
    function __swapNativeAssetToToken(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        require(
            IVault(address(this)).assetBalances(_fillAssets[1]) >= _fillExpectedAmounts[1],
            "__swapNativeAssetToToken: insufficient native token assetBalance"
        );

        // Convert WETH to ETH
        WETH(payable(_fillAssets[1])).withdraw(_fillExpectedAmounts[1]);

        // Swap tokens
        address tokenExchange = IUniswapFactory(EXCHANGE).getExchange(_fillAssets[0]);
        IUniswapExchange(tokenExchange).ethToTokenSwapInput.value(
            _fillExpectedAmounts[1]
        )
        (
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
        );
    }

    /// @notice Executes a swap of ERC20 (taker) to ETH (maker)
    function __swapTokenToNativeAsset(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        address tokenExchange = IUniswapFactory(EXCHANGE).getExchange(_fillAssets[1]);
        uint256 preEthBalance = payable(address(this)).balance;
        IUniswapExchange(tokenExchange).tokenToEthSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    /// @notice Executes a swap of ERC20 (taker) to ERC20 (maker)
    function __swapTokenToToken(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        address tokenExchange = IUniswapFactory(EXCHANGE).getExchange(_fillAssets[1]);
        IUniswapExchange(tokenExchange).tokenToTokenSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            1,
            add(block.timestamp, 1),
            _fillAssets[0]
        );
    }
}
