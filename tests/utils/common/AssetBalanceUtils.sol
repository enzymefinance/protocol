// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";
import {
    ETHEREUM_LENDING_POOL_ADDRESS as ETHEREUM_AAVE_V2_LENDING_POOL_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS as POLYGON_AAVE_V2_LENDING_POOL_ADDRESS
} from "tests/tests/protocols/aave/AaveV2Constants.sol";
import {
    ETHEREUM_POOL_ADDRESS as ETHEREUM_AAVE_V3_POOL_ADDRESS,
    POLYGON_POOL_ADDRESS as POLYGON_AAVE_V3_POOL_ADDRESS,
    ARBITRUM_POOL_ADDRESS as ARBITRUM_AAVE_V3_POOL_ADDRESS,
    BASE_POOL_ADDRESS as BASE_AAVE_V3_POOL_ADDRESS
} from "tests/tests/protocols/aave/AaveV3Constants.sol";
import {
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL,
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL
} from "tests/tests/protocols/zero-lend/ZeroLendConstants.sol";

import {
    ETHEREUM_COMPOUND_V3_CONFIGURATOR,
    POLYGON_COMPOUND_V3_CONFIGURATOR
} from "tests/tests/protocols/compound/CompoundV3Constants.sol";

import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {ICompoundV3Configurator} from "tests/interfaces/external/ICompoundV3Configurator.sol";
import {ICompoundV3Comet} from "tests/interfaces/external/ICompoundV3Comet.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IEtherFiLiquidityPool} from "tests/interfaces/external/IEtherFiLiquidityPool.sol";
import {ILidoSteth} from "tests/interfaces/external/ILidoSteth.sol";

abstract contract AssetBalanceUtils is CommonUtilsBase {
    using SafeERC20 for IERC20;

    function increaseNativeAssetBalance(address _to, uint256 _amount) internal {
        uint256 balance = _to.balance;

        deal(_to, balance + _amount);
    }

    /// @dev The default `deal()` implementation doesn't work with rebasing tokens, tokens using storage packing for balances, etc.
    /// e.g., Aave aTokens, Lido stETH, etc. See: currently doesn't work with aTokens https://github.com/foundry-rs/forge-std/issues/140
    /// As a workaround, inheriting utils can override this function to handle the various non-standard tokens per-network.
    function increaseTokenBalance(IERC20 _token, address _to, uint256 _amount) internal {
        if (isSteth(_token)) {
            increaseStethBalance(_to, _amount);
        } else if (isAaveV2Token(_token)) {
            increaseAaveV2TokenBalance(_token, _to, _amount);
        } else if (isAaveV3Token(_token, getAaveV3PoolAddressForChain())) {
            increaseAaveV3TokenBalance(_token, _to, _amount, getAaveV3PoolAddressForChain());
        } else if (isAaveV3Token(_token, getZeroLendAaveV3PoolAddressForChainAndMarket(ZeroLendMarket.RWA_STABLECOINS)))
        {
            increaseAaveV3TokenBalance(
                _token, _to, _amount, getZeroLendAaveV3PoolAddressForChainAndMarket(ZeroLendMarket.RWA_STABLECOINS)
            );
        } else if (isAaveV3Token(_token, getZeroLendAaveV3PoolAddressForChainAndMarket(ZeroLendMarket.LRT_BTC))) {
            increaseAaveV3TokenBalance(
                _token, _to, _amount, getZeroLendAaveV3PoolAddressForChainAndMarket(ZeroLendMarket.LRT_BTC)
            );
        } else if (isCompoundV3Token(_token)) {
            increaseCompoundV3TokenBalance(_token, _to, _amount);
        } else if (isEeth(_token)) {
            increaseEethBalance(_to, _amount);
        } else {
            uint256 balance = _token.balanceOf(_to);

            deal(address(_token), _to, balance + _amount);
        }
    }

    // INCREASE BALANCE HELPERS

    // Aave v2

    function getAaveV2LendingPoolAddressForChain() internal view returns (address lendingPoolAddress_) {
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            return ETHEREUM_AAVE_V2_LENDING_POOL_ADDRESS;
        } else if (block.chainid == POLYGON_CHAIN_ID) {
            return POLYGON_AAVE_V2_LENDING_POOL_ADDRESS;
        }
    }

    function increaseAaveV2TokenBalance(IERC20 _aToken, address _to, uint256 _amount) internal {
        IERC20 underlying = IERC20(IAaveAToken(address(_aToken)).UNDERLYING_ASSET_ADDRESS());

        // Increase underlying balance (allowing recursion as necessary, e.g., for stETH)
        increaseTokenBalance(underlying, _to, _amount);

        // Deposit underlying into Aave
        vm.startPrank(_to);
        // safeApprove() required for USDT
        address lendingPoolAddress = getAaveV2LendingPoolAddressForChain();
        underlying.safeApprove(lendingPoolAddress, _amount);
        IAaveV2LendingPool(lendingPoolAddress).deposit({
            _underlying: address(underlying),
            _amount: _amount,
            _to: _to,
            _referralCode: 0
        });
        vm.stopPrank();
    }

    function isAaveV2Token(IERC20 _token) internal returns (bool isAToken_) {
        address lendingPoolAddress = getAaveV2LendingPoolAddressForChain();
        if (lendingPoolAddress == address(0)) {
            return false;
        }

        // Sniff out aTokens by interface
        // Must not do a staticcall in case there is a fallback function with state modification
        (bool success, bytes memory returnData) =
            address(_token).call(abi.encodeWithSelector(IAaveAToken.UNDERLYING_ASSET_ADDRESS.selector));

        // Check that the call succeeded and returned exactly one memory slot
        if (!success || returnData.length != 32) {
            return false;
        }

        // Check Aave to confirm the aToken is from this version.
        // Must do this to distinguish Aave v2 from v3 tokens.
        IERC20 underlying = IERC20(abi.decode(returnData, (address)));

        IAaveV2LendingPool.ReserveData memory reserveData =
            IAaveV2LendingPool(lendingPoolAddress).getReserveData(address(underlying));

        return address(_token) == reserveData.aTokenAddress;
    }

    // Aave v3

    function getAaveV3PoolAddressForChain() internal view returns (address lendingPoolAddress_) {
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            return ETHEREUM_AAVE_V3_POOL_ADDRESS;
        } else if (block.chainid == POLYGON_CHAIN_ID) {
            return POLYGON_AAVE_V3_POOL_ADDRESS;
        } else if (block.chainid == ARBITRUM_CHAIN_ID) {
            return ARBITRUM_AAVE_V3_POOL_ADDRESS;
        } else if (block.chainid == BASE_CHAIN_ID) {
            return BASE_AAVE_V3_POOL_ADDRESS;
        }
    }

    // Zero Lend

    enum ZeroLendMarket {
        RWA_STABLECOINS,
        LRT_BTC
    }

    function getZeroLendAaveV3PoolAddressForChainAndMarket(ZeroLendMarket _market)
        internal
        view
        returns (address lendingPoolAddress_)
    {
        if (_market == ZeroLendMarket.RWA_STABLECOINS) {
            if (block.chainid == ETHEREUM_CHAIN_ID) {
                return ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL;
            }
        }

        if (_market == ZeroLendMarket.LRT_BTC) {
            if (block.chainid == ETHEREUM_CHAIN_ID) {
                return ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL;
            }
        }
    }

    function increaseAaveV3TokenBalance(IERC20 _aToken, address _to, uint256 _amount, address _lendingPoolAddress)
        internal
    {
        IERC20 underlying = IERC20(IAaveAToken(address(_aToken)).UNDERLYING_ASSET_ADDRESS());

        // Increase underlying balance (allowing recursion as necessary, e.g., for stETH)
        increaseTokenBalance(underlying, _to, _amount);

        // Deposit underlying into Aave
        vm.startPrank(_to);
        // safeApprove() required for USDT
        underlying.safeApprove(_lendingPoolAddress, _amount);
        IAaveV3Pool(_lendingPoolAddress).supply({
            _asset: address(underlying),
            _amount: _amount,
            _onBehalfOf: _to,
            _referralCode: 0
        });
        vm.stopPrank();
    }

    function isAaveV3Token(IERC20 _token, address _poolAddress) internal returns (bool isAToken_) {
        if (_poolAddress == address(0)) {
            return false;
        }
        // Sniff out aTokens by interface
        // Must not do a staticcall in case there is a fallback function with state modification
        (bool success, bytes memory returnData) =
            address(_token).call(abi.encodeWithSelector(IAaveAToken.UNDERLYING_ASSET_ADDRESS.selector));

        // Check that the call succeeded and returned exactly one memory slot
        if (!success || returnData.length != 32) {
            return false;
        }

        // Check Aave to confirm the aToken is from this version.
        // Must do this to distinguish Aave v2 from v3 tokens.
        IERC20 underlying = IERC20(abi.decode(returnData, (address)));

        IAaveV3Pool.ReserveData memory reserveData = IAaveV3Pool(_poolAddress).getReserveData(address(underlying));

        return address(_token) == reserveData.aTokenAddress;
    }

    // CompoundV3

    function getCompoundV3ConfiguratorForChain() internal view returns (address configurator_) {
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            return ETHEREUM_COMPOUND_V3_CONFIGURATOR;
        } else if (block.chainid == POLYGON_CHAIN_ID) {
            return POLYGON_COMPOUND_V3_CONFIGURATOR;
        }
    }

    function isCompoundV3Token(IERC20 _token) internal view returns (bool isCToken_) {
        ICompoundV3Configurator configurator = ICompoundV3Configurator(getCompoundV3ConfiguratorForChain());

        if (address(configurator) == address(0)) {
            return false;
        }

        return configurator.factory(address(_token)) != address(0);
    }

    function increaseCompoundV3TokenBalance(IERC20 _cToken, address _to, uint256 _amount) internal {
        ICompoundV3Comet cToken = ICompoundV3Comet(address(_cToken));

        IERC20 underlyingToken = IERC20(cToken.baseToken());

        increaseTokenBalance(underlyingToken, _to, _amount);
        vm.startPrank(_to);
        underlyingToken.approve(address(_cToken), _amount);
        cToken.supplyTo({_dst: _to, _asset: address(underlyingToken), _amount: _amount});
        vm.stopPrank();
    }

    // Ether.fi eeth

    function increaseEethBalance(address _to, uint256 _amount) internal {
        increaseNativeAssetBalance(_to, _amount);
        vm.prank(_to);
        IEtherFiLiquidityPool(ETHEREUM_ETHERFI_LIQUIDITY_POOL).deposit{value: _amount}();
    }

    function isEeth(IERC20 _token) internal view returns (bool isEeth_) {
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            address(_token) == ETHEREUM_EETH;
        } else {
            return false;
        }
    }

    // Lido stETH

    function increaseStethBalance(address _to, uint256 _amount) internal {
        increaseNativeAssetBalance(_to, _amount);
        vm.prank(_to);
        ILidoSteth(ETHEREUM_STETH).submit{value: _amount}(_to);
    }

    function isSteth(IERC20 _token) internal view returns (bool isSteth_) {
        // Ethereum only
        if (block.chainid != ETHEREUM_CHAIN_ID) {
            return false;
        }

        return address(_token) == ETHEREUM_STETH;
    }
}
