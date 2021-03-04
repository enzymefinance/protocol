// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/ICurveAddressProvider.sol";
import "../../../../interfaces/ICurveLiquidityGaugeV2.sol";
import "../../../../interfaces/ICurveLiquidityPool.sol";
import "../../../../interfaces/ICurveRegistry.sol";
import "../../../../interfaces/ICurveStableSwapSteth.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase2.sol";

/// @title CurveLiquidityStethAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve's steth pool (https://www.curve.fi/steth)
contract CurveLiquidityStethAdapter is AdapterBase2 {
    int128 private constant POOL_INDEX_ETH = 0;
    int128 private constant POOL_INDEX_STETH = 1;

    address private immutable LIQUIDITY_GAUGE_TOKEN;
    address private immutable LP_TOKEN;
    address private immutable POOL;
    address private immutable STETH_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _liquidityGaugeToken,
        address _lpToken,
        address _pool,
        address _stethToken,
        address _wethToken
    ) public AdapterBase2(_integrationManager) {
        LIQUIDITY_GAUGE_TOKEN = _liquidityGaugeToken;
        LP_TOKEN = _lpToken;
        POOL = _pool;
        STETH_TOKEN = _stethToken;
        WETH_TOKEN = _wethToken;

        // Max approve contracts to spend relevant tokens
        ERC20(_lpToken).safeApprove(_liquidityGaugeToken, type(uint256).max);
        ERC20(_stethToken).safeApprove(_pool, type(uint256).max);
    }

    /// @dev Needed to receive ETH from redemption and to unwrap WETH
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "CURVE_LIQUIDITY_STETH";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == LEND_SELECTOR || _selector == LEND_AND_STAKE_SELECTOR) {
            (
                uint256 outgoingWethAmount,
                uint256 outgoingStethAmount,
                uint256 minIncomingAssetAmount
            ) = __decodeLendCallArgs(_encodedCallArgs);

            if (outgoingWethAmount > 0 && outgoingStethAmount > 0) {
                spendAssets_ = new address[](2);
                spendAssets_[0] = WETH_TOKEN;
                spendAssets_[1] = STETH_TOKEN;

                spendAssetAmounts_ = new uint256[](2);
                spendAssetAmounts_[0] = outgoingWethAmount;
                spendAssetAmounts_[1] = outgoingStethAmount;
            } else if (outgoingWethAmount > 0) {
                spendAssets_ = new address[](1);
                spendAssets_[0] = WETH_TOKEN;

                spendAssetAmounts_ = new uint256[](1);
                spendAssetAmounts_[0] = outgoingWethAmount;
            } else {
                spendAssets_ = new address[](1);
                spendAssets_[0] = STETH_TOKEN;

                spendAssetAmounts_ = new uint256[](1);
                spendAssetAmounts_[0] = outgoingStethAmount;
            }

            incomingAssets_ = new address[](1);
            if (_selector == LEND_SELECTOR) {
                incomingAssets_[0] = LP_TOKEN;
            } else {
                incomingAssets_[0] = LIQUIDITY_GAUGE_TOKEN;
            }

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        } else if (_selector == REDEEM_SELECTOR || _selector == UNSTAKE_AND_REDEEM_SELECTOR) {
            (
                uint256 outgoingAssetAmount,
                uint256 minIncomingWethAmount,
                uint256 minIncomingStethAmount,
                bool receiveSingleAsset
            ) = __decodeRedeemCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            if (_selector == REDEEM_SELECTOR) {
                spendAssets_[0] = LP_TOKEN;
            } else {
                spendAssets_[0] = LIQUIDITY_GAUGE_TOKEN;
            }

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            if (receiveSingleAsset) {
                incomingAssets_ = new address[](1);
                minIncomingAssetAmounts_ = new uint256[](1);

                if (minIncomingWethAmount == 0) {
                    require(
                        minIncomingStethAmount > 0,
                        "parseAssetsForMethod: No min asset amount specified for receiveSingleAsset"
                    );
                    incomingAssets_[0] = STETH_TOKEN;
                    minIncomingAssetAmounts_[0] = minIncomingStethAmount;
                } else {
                    require(
                        minIncomingStethAmount == 0,
                        "parseAssetsForMethod: Too many min asset amounts specified for receiveSingleAsset"
                    );
                    incomingAssets_[0] = WETH_TOKEN;
                    minIncomingAssetAmounts_[0] = minIncomingWethAmount;
                }
            } else {
                incomingAssets_ = new address[](2);
                incomingAssets_[0] = WETH_TOKEN;
                incomingAssets_[1] = STETH_TOKEN;

                minIncomingAssetAmounts_ = new uint256[](2);
                minIncomingAssetAmounts_[0] = minIncomingWethAmount;
                minIncomingAssetAmounts_[1] = minIncomingStethAmount;
            }
        } else if (_selector == STAKE_SELECTOR) {
            uint256 outgoingLPTokenAmount = __decodeStakeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = LP_TOKEN;

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingLPTokenAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = outgoingLPTokenAmount;
        } else if (_selector == UNSTAKE_SELECTOR) {
            uint256 outgoingLiquidityGaugeTokenAmount = __decodeUnstakeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = LP_TOKEN;

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;
        } else {
            revert("parseAssetsForMethod: _selector invalid");
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Lends assets for steth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingWethAmount,
            uint256 outgoingStethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __lend(outgoingWethAmount, outgoingStethAmount, minIncomingLiquidityGaugeTokenAmount);
    }

    /// @notice Lends assets for steth LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lendAndStake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingWethAmount,
            uint256 outgoingStethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __lend(outgoingWethAmount, outgoingStethAmount, minIncomingLiquidityGaugeTokenAmount);
        __stake(ERC20(LP_TOKEN).balanceOf(address(this)));
    }

    /// @notice Redeems steth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingLPTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingStethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __redeem(
            outgoingLPTokenAmount,
            minIncomingWethAmount,
            minIncomingStethAmount,
            redeemSingleAsset
        );
    }

    /// @notice Stakes steth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function stake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        uint256 outgoingLPTokenAmount = __decodeStakeCallArgs(_encodedCallArgs);

        __stake(outgoingLPTokenAmount);
    }

    /// @notice Unstakes steth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function unstake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        uint256 outgoingLiquidityGaugeTokenAmount = __decodeUnstakeCallArgs(_encodedCallArgs);

        __unstake(outgoingLiquidityGaugeTokenAmount);
    }

    /// @notice Unstakes steth LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function unstakeAndRedeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingLiquidityGaugeTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingStethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __unstake(outgoingLiquidityGaugeTokenAmount);
        __redeem(
            outgoingLiquidityGaugeTokenAmount,
            minIncomingWethAmount,
            minIncomingStethAmount,
            redeemSingleAsset
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to execute lend
    function __lend(
        uint256 _outgoingWethAmount,
        uint256 _outgoingStethAmount,
        uint256 _minIncomingLPTokenAmount
    ) private {
        if (_outgoingWethAmount > 0) {
            IWETH((WETH_TOKEN)).withdraw(_outgoingWethAmount);
        }

        ICurveStableSwapSteth(POOL).add_liquidity{value: _outgoingWethAmount}(
            [_outgoingWethAmount, _outgoingStethAmount],
            _minIncomingLPTokenAmount
        );
    }

    /// @dev Helper to execute redeem
    function __redeem(
        uint256 _outgoingLPTokenAmount,
        uint256 _minIncomingWethAmount,
        uint256 _minIncomingStethAmount,
        bool _redeemSingleAsset
    ) private {
        if (_redeemSingleAsset) {
            // "_minIncomingWethAmount > 0 XOR _minIncomingStethAmount > 0" has already been
            // validated in parseAssetsForMethod()
            if (_minIncomingWethAmount > 0) {
                ICurveStableSwapSteth(POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    POOL_INDEX_ETH,
                    _minIncomingWethAmount
                );

                IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
            } else {
                ICurveStableSwapSteth(POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    POOL_INDEX_STETH,
                    _minIncomingStethAmount
                );
            }
        } else {
            ICurveStableSwapSteth(POOL).remove_liquidity(
                _outgoingLPTokenAmount,
                [_minIncomingWethAmount, _minIncomingStethAmount]
            );

            IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
        }
    }

    /// @dev Helper to execute stake
    function __stake(uint256 _lpTokenAmount) private {
        ICurveLiquidityGaugeV2(LIQUIDITY_GAUGE_TOKEN).deposit(_lpTokenAmount, address(this));
    }

    /// @dev Helper to execute unstake
    function __unstake(uint256 _liquidityGaugeTokenAmount) private {
        ICurveLiquidityGaugeV2(LIQUIDITY_GAUGE_TOKEN).withdraw(_liquidityGaugeTokenAmount);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingWethAmount_,
            uint256 outgoingStethAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming.
    /// If `receiveSingleAsset_` is `true`, then one (and only one) of
    /// `minIncomingWethAmount_` and `minIncomingStethAmount_` must be >0
    /// to indicate which asset is to be received.
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            uint256 minIncomingWethAmount_,
            uint256 minIncomingStethAmount_,
            bool receiveSingleAsset_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingLPTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking
    function __decodeUnstakeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingLiquidityGaugeTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `LIQUIDITY_GAUGE_TOKEN` variable
    /// @return liquidityGaugeToken_ The `LIQUIDITY_GAUGE_TOKEN` variable value
    function getLiquidityGaugeToken() external view returns (address liquidityGaugeToken_) {
        return LIQUIDITY_GAUGE_TOKEN;
    }

    /// @notice Gets the `LP_TOKEN` variable
    /// @return lpToken_ The `LP_TOKEN` variable value
    function getLPToken() external view returns (address lpToken_) {
        return LP_TOKEN;
    }

    /// @notice Gets the `POOL` variable
    /// @return pool_ The `POOL` variable value
    function getPool() external view returns (address pool_) {
        return POOL;
    }

    /// @notice Gets the `STETH_TOKEN` variable
    /// @return stethToken_ The `STETH_TOKEN` variable value
    function getStethToken() external view returns (address stethToken_) {
        return STETH_TOKEN;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
