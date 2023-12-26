// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IUniswapV3Factory} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Factory.sol";
import {IArrakisV2Vault} from "../../../../../external-interfaces/IArrakisV2Vault.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {CorePositionValue} from "../../../../../utils/0.8.19/uniswap/adapted-libs/CorePositionValue.sol";
import {UniswapV3PositionHelper} from "../../../../../utils/0.8.19/uniswap/UniswapV3PositionHelper.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title ArrakisV2PriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for ArrakisV2 vaults
contract ArrakisV2PriceFeed is IDerivativePriceFeed {
    uint256 private constant ONE_HUNDRED_PERCENT_BPS = 10_000;

    IUniswapV3Factory private immutable UNISWAP_V3_FACTORY;
    address private immutable VALUE_INTERPRETER_ADDRESS;

    constructor(address _uniswapV3FactoryAddress, address _valueInterpreterAddress) {
        UNISWAP_V3_FACTORY = IUniswapV3Factory(_uniswapV3FactoryAddress);
        VALUE_INTERPRETER_ADDRESS = _valueInterpreterAddress;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        IArrakisV2Vault arrakisVault = IArrakisV2Vault(_derivative);

        address token0Address = arrakisVault.token0();
        address token1Address = arrakisVault.token1();

        underlyings_ = new address[](2);
        underlyings_[0] = address(token0Address);
        underlyings_[1] = address(token1Address);

        underlyingAmounts_ = new uint256[](2);

        (uint256 totalToken0Amount, uint256 totalToken1Amount) = __calcTotalTokensDueToHolders({
            _arrakisVault: arrakisVault,
            _token0Address: token0Address,
            _token1Address: token1Address
        });

        // Prorate both underlying amounts by the derivative amount relative to the supply
        uint256 totalSupply = arrakisVault.totalSupply();
        underlyingAmounts_[0] = totalToken0Amount * _derivativeAmount / totalSupply;
        underlyingAmounts_[1] = totalToken1Amount * _derivativeAmount / totalSupply;

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @return isSupported_ True if the asset is supported
    /// @dev Always return true, as there is no simple and reliable sanity check
    function isSupportedAsset(address) external pure override returns (bool isSupported_) {
        return true;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper function to apply manager fees to raw fees
    function __applyManagerFee(uint256 _rawFee0, uint256 _rawFee1, uint16 _managerFeeBPS)
        private
        pure
        returns (uint256 fee0_, uint256 fee1_)
    {
        fee0_ = _rawFee0 - (_rawFee0 * _managerFeeBPS / ONE_HUNDRED_PERCENT_BPS);
        fee1_ = _rawFee1 - (_rawFee1 * _managerFeeBPS / ONE_HUNDRED_PERCENT_BPS);

        return (fee0_, fee1_);
    }

    /// @dev Helper to calculate the total amounts of token0 and token1 due to Arrakis vault holders
    function __calcTotalTokensDueToHolders(
        IArrakisV2Vault _arrakisVault,
        address _token0Address,
        address _token1Address
    ) private returns (uint256 totalToken0Amount_, uint256 totalToken1Amount_) {
        // Total token amounts due to holders include:
        // (1) uniswap pool principal
        // (2) uniswap pool uncollected fees, net of Arrakis manager fees
        // (3) "leftover" in Arrakis vault (tokens balances net amounts owed to the manager)

        // Calc the trusted price for the token pair as a sqrt ratio
        uint160 sqrtRatioX96 = UniswapV3PositionHelper.calcAssetPairSqrtRatioX96({
            _valueInterpreterAddress: VALUE_INTERPRETER_ADDRESS,
            _token0Address: _token0Address,
            _token1Address: _token1Address
        });

        // Calc principal and fees for each position in the Arrakis vault
        uint256 totalRawFees0;
        uint256 totalRawFees1;
        IArrakisV2Vault.Range[] memory ranges = _arrakisVault.getRanges();
        for (uint256 i = 0; i < ranges.length; i++) {
            IArrakisV2Vault.Range memory range = ranges[i];

            address poolAddress =
                UNISWAP_V3_FACTORY.getPool({tokenA: _token0Address, tokenB: _token1Address, fee: range.feeTier});

            {
                (uint256 principal0, uint256 principal1) = CorePositionValue.principal({
                    poolAddress: poolAddress,
                    owner: address(_arrakisVault),
                    tickLower: range.lowerTick,
                    tickUpper: range.upperTick,
                    sqrtRatioX96: sqrtRatioX96
                });

                totalToken0Amount_ += principal0;
                totalToken1Amount_ += principal1;
            }

            {
                (uint256 rawFees0, uint256 rawFees1) = CorePositionValue.fees({
                    poolAddress: poolAddress,
                    owner: address(_arrakisVault),
                    tickLower: range.lowerTick,
                    tickUpper: range.upperTick
                });

                totalRawFees0 += rawFees0;
                totalRawFees1 += rawFees1;
            }
        }

        // Include fees net of manager fees
        (uint256 netFees0, uint256 netFees1) = __applyManagerFee({
            _rawFee0: totalRawFees0,
            _rawFee1: totalRawFees1,
            _managerFeeBPS: _arrakisVault.managerFeeBPS()
        });
        totalToken0Amount_ += netFees0;
        totalToken1Amount_ += netFees1;

        // Include "leftover" amounts (tokens held by the arrakisVault and not owed to the manager)
        totalToken0Amount_ += IERC20(_token0Address).balanceOf(address(_arrakisVault)) - _arrakisVault.managerBalance0();
        totalToken1Amount_ += IERC20(_token1Address).balanceOf(address(_arrakisVault)) - _arrakisVault.managerBalance1();

        return (totalToken0Amount_, totalToken1Amount_);
    }
}
