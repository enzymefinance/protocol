// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IUniswapV3LiquidityPosition as IUniswapV3LiquidityPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/uniswap-v3-liquidity/IUniswapV3LiquidityPosition.sol";

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IUniswapV3Pool} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Pool.sol";
import {IUniswapV3Factory} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Factory.sol";
import {TickMath} from "uniswap-v3-core-0.8/contracts/libraries/TickMath.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {INonfungiblePositionManager} from "tests/interfaces/external/INonfungiblePositionManager.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IUniswapV3LiquidityPositionLib} from "tests/interfaces/internal/IUniswapV3LiquidityPositionLib.sol";

import {
    ETHEREUM_NON_FUNGIBLE_TOKEN_MANAGER,
    ETHEREUM_FACTORY_ADDRESS,
    POLYGON_NON_FUNGIBLE_TOKEN_MANAGER,
    POLYGON_FACTORY_ADDRESS,
    ARBITRUM_NON_FUNGIBLE_TOKEN_MANAGER,
    ARBITRUM_FACTORY_ADDRESS,
    UniswapV3Utils
} from "./UniswapV3Utils.sol";

abstract contract TestBase is UniswapV3Utils, IntegrationTest {
    event NFTPositionAdded(uint256 indexed tokenId);
    event NFTPositionRemoved(uint256 indexed tokenId);

    // default units minted in tests
    uint24 internal constant UNITS_MINTED = 1_000;

    // fee tiers
    uint24 internal constant FEE_HIGH = 10_000;
    uint24 internal constant FEE_MEDIUM = 3_000;
    uint24 internal constant FEE_LOW = 500;
    uint24 internal constant FEE_LOWEST = 100;

    uint256 internal BUFFER_PERCENT = WEI_ONE_PERCENT / 2; // 0.5%, buffer percent used for checking balances

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IUniswapV3LiquidityPositionLib internal uniswapV3LiquidityPosition;

    // Set by child contract
    EnzymeVersion internal version;
    address internal factoryAddress;
    address internal nonFungibleTokenManagerAddress;

    function setUp() public virtual override {
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all UniswapV3LiquidityPosition dependencies
        uint256 typeId = __deployPositionType({
            _nonFungibleTokenManagerAddress: nonFungibleTokenManagerAddress,
            _valueInterpreter: IValueInterpreter(address(getValueInterpreterAddressForVersion(version)))
        });

        // Create an empty UniswapV3LiquidityPosition for the fund
        vm.prank(fundOwner);
        uniswapV3LiquidityPosition = IUniswapV3LiquidityPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS
    function __deployLib(address _nonFungibleTokenManagerAddress, IValueInterpreter _valueInterpreter)
        internal
        returns (address lib_)
    {
        bytes memory args = abi.encode(_nonFungibleTokenManagerAddress, _valueInterpreter);

        return deployCode("UniswapV3LiquidityPositionLib.sol", args);
    }

    function __deployParser(address _nonFungibleTokenManagerAddress, IValueInterpreter _valueInterpreter)
        internal
        returns (address parser_)
    {
        bytes memory args = abi.encode(_valueInterpreter, _nonFungibleTokenManagerAddress);

        return deployCode("UniswapV3LiquidityPositionParser.sol", args);
    }

    function __deployPositionType(address _nonFungibleTokenManagerAddress, IValueInterpreter _valueInterpreter)
        internal
        returns (uint256 typeId_)
    {
        // Deploy Uniswap V3 Liquidity type contracts
        address uniswapV3LiquidityPositionLibAddress = address(
            __deployLib({
                _nonFungibleTokenManagerAddress: _nonFungibleTokenManagerAddress,
                _valueInterpreter: _valueInterpreter
            })
        );

        address uniswapV3LiquidityPositionPositionParserAddress = address(
            __deployParser({
                _nonFungibleTokenManagerAddress: _nonFungibleTokenManagerAddress,
                _valueInterpreter: _valueInterpreter
            })
        );

        // Register UniswapV3LiquidityPosition type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "UNISWAP_V3_LIQUIDITY",
            _lib: uniswapV3LiquidityPositionLibAddress,
            _parser: uniswapV3LiquidityPositionPositionParserAddress
        });

        return (typeId_);
    }

    // ACTION HELPERS

    function __mint(
        address _token0,
        address _token1,
        uint24 _fee,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amount0Desired,
        uint256 _amount1Desired,
        uint256 _amount0Min,
        uint256 _amount1Min
    ) internal {
        bytes memory actionArgs = abi.encode(
            _token0, _token1, _fee, _tickLower, _tickUpper, _amount0Desired, _amount1Desired, _amount0Min, _amount1Min
        );

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(uniswapV3LiquidityPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IUniswapV3LiquidityPositionProd.UniswapV3LiquidityPositionActions.Mint)
        });
    }

    function __addLiquidity(
        uint256 _nftId,
        uint256 _amount0Desired,
        uint256 _amount1Desired,
        uint256 _amount0Min,
        uint256 _amount1Min
    ) internal {
        bytes memory actionArgs = abi.encode(_nftId, _amount0Desired, _amount1Desired, _amount0Min, _amount1Min);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(uniswapV3LiquidityPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IUniswapV3LiquidityPositionProd.UniswapV3LiquidityPositionActions.AddLiquidity)
        });
    }

    function __removeLiquidity(uint256 _nftId, uint128 _liquidity, uint256 _amount0Min, uint256 _amount1Min) internal {
        bytes memory actionArgs = abi.encode(_nftId, _liquidity, _amount0Min, _amount1Min);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(uniswapV3LiquidityPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IUniswapV3LiquidityPositionProd.UniswapV3LiquidityPositionActions.RemoveLiquidity)
        });
    }

    function __collect(uint256 _nftId) internal {
        bytes memory actionArgs = abi.encode(_nftId);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(uniswapV3LiquidityPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IUniswapV3LiquidityPositionProd.UniswapV3LiquidityPositionActions.Collect)
        });
    }

    function __purge(uint256 _nftId, uint128 _liquidity, uint256 _amount0Min, uint256 _amount1Min) internal {
        bytes memory actionArgs = abi.encode(_nftId, _liquidity, _amount0Min, _amount1Min);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(uniswapV3LiquidityPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IUniswapV3LiquidityPositionProd.UniswapV3LiquidityPositionActions.Purge)
        });
    }

    // Misc helpers

    /// @dev Get next token id from storage, because there is no getter for it
    function __getNextTokenId() internal view returns (uint176 nextTokenId_) {
        bytes32 nonFungibleTokenManagerSlot13 = vm.load(nonFungibleTokenManagerAddress, bytes32(uint256(13)));
        return uint176(uint256(nonFungibleTokenManagerSlot13));
    }

    /// @dev Helper to get the total liquidity of an nft position.
    /// Uses a low-level staticcall() and truncated decoding of `.positions()`
    /// in order to avoid compilation error.
    function __getLiquidityForNFT(uint256 _tokenId) internal view returns (uint128 liquidity_) {
        (bool success, bytes memory returnData) = nonFungibleTokenManagerAddress.staticcall(
            abi.encodeWithSelector(INonfungiblePositionManager.positions.selector, _tokenId)
        );
        require(success, string(returnData));

        (,,,,,,, liquidity_) =
            abi.decode(returnData, (uint96, address, address, address, uint24, int24, int24, uint128));

        return liquidity_;
    }

    function __getPoolInfo(address _tokenA, address _tokenB, uint24 _fee)
        internal
        view
        returns (IUniswapV3Pool pool_, address token0_, address token1_)
    {
        // get pool
        pool_ = IUniswapV3Pool(IUniswapV3Factory(factoryAddress).getPool({tokenA: _tokenA, tokenB: _tokenB, fee: _fee}));
        // get actual order of tokens in the pool
        token0_ = pool_.token0();
        token1_ = pool_.token1();

        return (pool_, token0_, token1_);
    }

    function __mintNft(address _token0, address _token1, uint24 _fee) internal returns (uint256 tokenId_) {
        return __mintNft({
            _token0: _token0,
            _token1: _token1,
            _fee: _fee,
            _tickLower: TickMath.MIN_TICK,
            _tickUpper: TickMath.MAX_TICK,
            _amountDesiredUnits: UNITS_MINTED
        });
    }

    function __mintNft(
        address _token0,
        address _token1,
        uint24 _fee,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 _amountDesiredUnits
    ) internal returns (uint256 tokenId_) {
        tokenId_ = __getNextTokenId();

        uint256 amount0Desired = _amountDesiredUnits * assetUnit(IERC20(_token0));
        uint256 amount1Desired = _amountDesiredUnits * assetUnit(IERC20(_token1));

        // Increase token balances of the fund
        increaseTokenBalance({_token: IERC20(_token0), _to: vaultProxyAddress, _amount: amount0Desired});
        increaseTokenBalance({_token: IERC20(_token1), _to: vaultProxyAddress, _amount: amount1Desired});

        __mint({
            _token0: _token0,
            _token1: _token1,
            _fee: _fee,
            _tickLower: _tickLower,
            _tickUpper: _tickUpper,
            _amount0Desired: amount0Desired,
            _amount1Desired: amount1Desired,
            _amount0Min: 0,
            _amount1Min: 0
        });

        return uint256(tokenId_);
    }

    function __scaleUpTokenTo18Decimals(IERC20 _token, uint256 _amount) internal view returns (uint256 scaledAmount_) {
        return _amount * 10 ** (18 - IERC20(_token).decimals());
    }
}

/// @dev Test works only correctly for stable pools, like DAI/USDC
abstract contract MintTest is TestBase {
    function __test_mint_success(address _tokenA, address _tokenB, uint24 _fee) internal {
        // get values before mint, to use later for assertions
        uint176 nextTokenId = __getNextTokenId();
        uint256 nftsLengthBeforeMint = uniswapV3LiquidityPosition.getNftIds().length;
        uint256 token0BalanceBeforeMint;
        uint256 token1BalanceBeforeMint;

        // get pool
        IUniswapV3Pool pool =
            IUniswapV3Pool(IUniswapV3Factory(factoryAddress).getPool({tokenA: _tokenA, tokenB: _tokenB, fee: _fee}));
        // get actual order of tokens in the pool
        address token0 = pool.token0();
        address token1 = pool.token1();
        {
            (address[] memory assetsBeforeMint, uint256[] memory amountsBeforeMint) =
                uniswapV3LiquidityPosition.getManagedAssets();
            for (uint256 i = 0; i < assetsBeforeMint.length; i++) {
                if (assetsBeforeMint[i] == token0) {
                    token0BalanceBeforeMint = amountsBeforeMint[i];
                } else if (assetsBeforeMint[i] == token1) {
                    token1BalanceBeforeMint = amountsBeforeMint[i];
                }
            }
        }

        {
            uint256 amount0Desired = UNITS_MINTED * assetUnit(IERC20(token0));
            uint256 amount1Desired = UNITS_MINTED * assetUnit(IERC20(token1));
            // Increase token balances of the fund
            increaseTokenBalance({_token: IERC20(token0), _to: vaultProxyAddress, _amount: amount0Desired});
            increaseTokenBalance({_token: IERC20(token1), _to: vaultProxyAddress, _amount: amount1Desired});

            expectEmit(address(uniswapV3LiquidityPosition));
            emit NFTPositionAdded(nextTokenId);

            vm.recordLogs();

            __mint({
                _token0: token0,
                _token1: token1,
                _fee: _fee,
                _tickLower: TickMath.MIN_TICK,
                _tickUpper: TickMath.MAX_TICK,
                _amount0Desired: amount0Desired,
                _amount1Desired: amount1Desired,
                _amount0Min: 1,
                _amount1Min: 1
            });
        }
        // Assert values
        {
            // Nothing should be received
            assertExternalPositionAssetsToReceive({
                _logs: vm.getRecordedLogs(),
                _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
                _assets: new address[](0)
            });

            // Check that the NFT was minted
            uint256[] memory nftIds = uniswapV3LiquidityPosition.getNftIds();
            assertEq(nftIds.length, nftsLengthBeforeMint + 1, "NFTs length mismatch");
            assertEq(nftIds[nftIds.length - 1], nextTokenId, "Token id mismatch");

            // Check that getManagedAssets returns the correct assets
            (address[] memory assetsAfterMint, uint256[] memory amountsAfterMint) =
                uniswapV3LiquidityPosition.getManagedAssets();

            // Check that the underlyings provided to the Uniswap LP are contained in the External Positions' managed assets
            // Check that the EPs valuation has increased by the underlying amounts provided.
            bool foundToken0;
            bool foundToken1;

            for (uint256 i = 0; i < assetsAfterMint.length; i++) {
                if (assetsAfterMint[i] == token0) {
                    foundToken0 = true;
                    assertApproxEqRel(
                        amountsAfterMint[i],
                        token0BalanceBeforeMint + UNITS_MINTED * assetUnit(IERC20(token0)),
                        BUFFER_PERCENT,
                        "Token0 amount mismatch"
                    );
                } else if (assetsAfterMint[i] == token1) {
                    foundToken1 = true;
                    assertApproxEqRel(
                        amountsAfterMint[i],
                        token1BalanceBeforeMint + UNITS_MINTED * assetUnit(IERC20(token1)),
                        BUFFER_PERCENT,
                        "Token1 amount mismatch"
                    );
                }
            }
            assertTrue(foundToken0, "Token0 is not in managed assets");
            assertTrue(foundToken1, "Token1 is not in managed assets");
        }
    }
}

abstract contract AddLiquidityTest is TestBase {
    function __test_addLiquidity_success(address _tokenA, address _tokenB, uint24 _fee) internal {
        (, address token0, address token1) = __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        // mint nft, so we can add liquidity to it
        uint256 tokenId = __mintNft({_token0: token0, _token1: token1, _fee: _fee});

        // check balances before add liquidity, to use later for assertions
        uint256 token0BalanceBeforeAddLiquidity;
        uint256 token1BalanceBeforeAddLiquidity;
        {
            (address[] memory assetsBeforeAddLiquidity, uint256[] memory amountsBeforeAddLiquidity) =
                uniswapV3LiquidityPosition.getManagedAssets();
            for (uint256 i = 0; i < assetsBeforeAddLiquidity.length; i++) {
                if (assetsBeforeAddLiquidity[i] == token0) {
                    token0BalanceBeforeAddLiquidity = amountsBeforeAddLiquidity[i];
                } else if (assetsBeforeAddLiquidity[i] == token1) {
                    token1BalanceBeforeAddLiquidity = amountsBeforeAddLiquidity[i];
                }
            }
        }

        {
            uint256 amount0Desired = UNITS_MINTED * assetUnit(IERC20(token0));
            uint256 amount1Desired = UNITS_MINTED * assetUnit(IERC20(token1));

            // Increase token balances of the fund
            increaseTokenBalance({_token: IERC20(token0), _to: vaultProxyAddress, _amount: amount0Desired});
            increaseTokenBalance({_token: IERC20(token1), _to: vaultProxyAddress, _amount: amount1Desired});

            vm.recordLogs();

            __addLiquidity({
                _nftId: tokenId,
                _amount0Desired: amount0Desired,
                _amount1Desired: amount1Desired,
                _amount0Min: 0,
                _amount1Min: 0
            });
        }

        // Assert values
        {
            // Nothing should be received
            assertExternalPositionAssetsToReceive({
                _logs: vm.getRecordedLogs(),
                _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
                _assets: new address[](0)
            });

            // Check that getManagedAssets returns the correct assets
            (address[] memory assetsAfterAddLiquidity, uint256[] memory amountsAfterAddLiquidity) =
                uniswapV3LiquidityPosition.getManagedAssets();

            // check that balances of external position increased
            for (uint256 i = 0; i < assetsAfterAddLiquidity.length; i++) {
                if (assetsAfterAddLiquidity[i] == token0) {
                    assertApproxEqRel(
                        amountsAfterAddLiquidity[i],
                        token0BalanceBeforeAddLiquidity + UNITS_MINTED * assetUnit(IERC20(token0)),
                        BUFFER_PERCENT,
                        "Token0 amount mismatch"
                    );
                } else if (assetsAfterAddLiquidity[i] == token1) {
                    assertApproxEqRel(
                        amountsAfterAddLiquidity[i],
                        token1BalanceBeforeAddLiquidity + UNITS_MINTED * assetUnit(IERC20(token1)),
                        BUFFER_PERCENT,
                        "Token1 amount mismatch"
                    );
                }
            }
        }
    }
}

abstract contract CollectTest is TestBase {
    function __test_collect_success(address _tokenA, address _tokenB, uint24 _fee) internal {
        (IUniswapV3Pool pool, address token0, address token1) =
            __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        // mint nft, so we can add liquidity to it
        uint256 tokenId = __mintNft({_token0: token0, _token1: token1, _fee: _fee});

        uint256 token0VaultBalanceBeforeCollect = IERC20(token0).balanceOf(vaultProxyAddress);
        uint256 token1VaultBalanceBeforeCollect = IERC20(token1).balanceOf(vaultProxyAddress);

        // Generate some fees to collect
        uniswapV3DoNRoundTripSwaps({_pool: pool, _nSwaps: 1000});

        vm.recordLogs();

        __collect({_nftId: tokenId});

        // Assert values

        address[] memory assetsToReceive = new address[](2);
        assetsToReceive[0] = token0;
        assetsToReceive[1] = token1;

        // Token0 and token1 should be received
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: assetsToReceive
        });

        // Check that something was collected and tokens balances increased
        assertGt(
            IERC20(token0).balanceOf(vaultProxyAddress),
            token0VaultBalanceBeforeCollect,
            "Token0 balance didn't increase"
        );
        assertGt(
            IERC20(token1).balanceOf(vaultProxyAddress),
            token1VaultBalanceBeforeCollect,
            "Token1 balance didn't increase"
        );
    }
}

abstract contract RemoveLiquidityTest is TestBase {
    function __test_removeLiquidity_success(address _tokenA, address _tokenB, uint24 _fee) internal {
        (, address token0, address token1) = __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        // mint nft, so we can add liquidity to it
        uint256 tokenId = __mintNft({_token0: token0, _token1: token1, _fee: _fee});

        uint128 liquidityBefore = __getLiquidityForNFT(tokenId);

        uint128 liquidityToRemove = liquidityBefore / 5;
        uint256 token0VaultBalanceBeforeRemoval = IERC20(token0).balanceOf(vaultProxyAddress);
        uint256 token1VaultBalanceBeforeRemoval = IERC20(token1).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __removeLiquidity({_nftId: tokenId, _liquidity: liquidityToRemove, _amount0Min: 1, _amount1Min: 1});

        // check liquidity balance
        assertEq(__getLiquidityForNFT(tokenId), liquidityBefore - liquidityToRemove, "Liquidity balance mismatch");

        address[] memory assetsToReceive = new address[](2);
        assetsToReceive[0] = token0;
        assetsToReceive[1] = token1;

        // Token0 and token1 should be received
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: assetsToReceive
        });

        // Check that the token balances have increased by the expected amounts
        assertApproxEqRel(
            IERC20(token0).balanceOf(vaultProxyAddress),
            token0VaultBalanceBeforeRemoval + UNITS_MINTED * assetUnit(IERC20(token0)) / 5,
            BUFFER_PERCENT,
            "Token0 balance didn't increase"
        );
        assertApproxEqRel(
            IERC20(token1).balanceOf(vaultProxyAddress),
            token1VaultBalanceBeforeRemoval + UNITS_MINTED * assetUnit(IERC20(token1)) / 5,
            BUFFER_PERCENT,
            "Token1 balance didn't increase"
        );
    }
}

abstract contract PurgeTest is TestBase {
    function __test_purge_liquiditySuccess(address _tokenA, address _tokenB, uint24 _fee, bool _isLiquidityKnownUpfront)
        internal
    {
        (, address token0, address token1) = __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        // mint nft, so we can add liquidity to it
        uint256 tokenId = __mintNft({_token0: token0, _token1: token1, _fee: _fee});

        uint256 nftsLengthBeforePurge = uniswapV3LiquidityPosition.getNftIds().length;
        uint256 token0VaultBalanceBeforeRemoval = IERC20(token0).balanceOf(vaultProxyAddress);
        uint256 token1VaultBalanceBeforeRemoval = IERC20(token1).balanceOf(vaultProxyAddress);

        expectEmit(address(uniswapV3LiquidityPosition));
        emit NFTPositionRemoved(tokenId);

        vm.recordLogs();

        __purge({
            _nftId: tokenId,
            _liquidity: _isLiquidityKnownUpfront ? __getLiquidityForNFT(tokenId) : type(uint128).max,
            _amount0Min: 1,
            _amount1Min: 1
        });

        address[] memory assetsToReceive = new address[](2);
        assetsToReceive[0] = token0;
        assetsToReceive[1] = token1;

        // Token0 and token1 should be received
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: assetsToReceive
        });

        __assertNftWasRemoved({_tokenId: tokenId, _nftsLengthBefore: nftsLengthBeforePurge});

        // Check that the token balances have increased by the expected amounts
        assertApproxEqRel(
            IERC20(token0).balanceOf(vaultProxyAddress),
            token0VaultBalanceBeforeRemoval + UNITS_MINTED * assetUnit(IERC20(token0)),
            BUFFER_PERCENT,
            "Token0 balance didn't increase"
        );
        assertApproxEqRel(
            IERC20(token1).balanceOf(vaultProxyAddress),
            token1VaultBalanceBeforeRemoval + UNITS_MINTED * assetUnit(IERC20(token1)),
            BUFFER_PERCENT,
            "Token1 balance didn't increase"
        );
    }

    function __assertNftWasRemoved(uint256 _tokenId, uint256 _nftsLengthBefore) internal {
        assertEq(uniswapV3LiquidityPosition.getToken0ForNft(_tokenId), address(0), "Nft not removed");
        assertEq(uniswapV3LiquidityPosition.getToken1ForNft(_tokenId), address(0), "Nft not removed");
        assertEq(uniswapV3LiquidityPosition.getNftIds().length, _nftsLengthBefore - 1, "NFTs length mismatch");
    }

    function __test_purge_liquidityKnownUpfrontSuccess(address _tokenA, address _tokenB, uint24 _fee) internal {
        __test_purge_liquiditySuccess({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee, _isLiquidityKnownUpfront: true});
    }

    function __test_purge_liquidityUnknownUpfrontSuccess(address _tokenA, address _tokenB, uint24 _fee) internal {
        __test_purge_liquiditySuccess({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee, _isLiquidityKnownUpfront: false});
    }

    function __test_purge_noLiquidityRemovedSuccess(address _tokenA, address _tokenB, uint24 _fee) internal {
        (, address token0, address token1) = __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        // mint nft, so we can add liquidity to it
        uint256 tokenId = __mintNft({_token0: token0, _token1: token1, _fee: _fee});

        // remove the whole liquidity, so we will be able to purge it without removing any liquidity
        __removeLiquidity({_nftId: tokenId, _liquidity: __getLiquidityForNFT(tokenId), _amount0Min: 1, _amount1Min: 1});

        uint256 nftsLengthBeforePurge = uniswapV3LiquidityPosition.getNftIds().length;
        uint256 token0VaultBalanceBeforeRemoval = IERC20(token0).balanceOf(vaultProxyAddress);
        uint256 token1VaultBalanceBeforeRemoval = IERC20(token1).balanceOf(vaultProxyAddress);

        expectEmit(address(uniswapV3LiquidityPosition));
        emit NFTPositionRemoved(tokenId);

        vm.recordLogs();

        __purge({_nftId: tokenId, _liquidity: 0, _amount0Min: 1, _amount1Min: 1});

        // Check that NFT was removed
        assertEq(uniswapV3LiquidityPosition.getToken0ForNft(tokenId), address(0), "Nft not removed");
        assertEq(uniswapV3LiquidityPosition.getToken1ForNft(tokenId), address(0), "Nft not removed");

        address[] memory assetsToReceive = new address[](2);
        assetsToReceive[0] = token0;
        assetsToReceive[1] = token1;

        // Token0 and token1 should be received
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: assetsToReceive
        });

        __assertNftWasRemoved({_tokenId: tokenId, _nftsLengthBefore: nftsLengthBeforePurge});

        // No liqudity should be removed so no balances increased
        assertEq(
            IERC20(token0).balanceOf(vaultProxyAddress),
            token0VaultBalanceBeforeRemoval,
            "Token0 balance didn't increase"
        );
        assertEq(
            IERC20(token1).balanceOf(vaultProxyAddress),
            token1VaultBalanceBeforeRemoval,
            "Token1 balance didn't increase"
        );
    }
}

abstract contract ManagedAssetsTest is TestBase {
    /// @dev multiple nfts of same asset pair, and one nft with asset that belongs to first pair
    function __test_managedAssets_sameNftsAndRelatedNftSuccess(
        address _tokenA,
        address _tokenB,
        uint24 _feeFirstPool,
        address _tokenC,
        uint24 _feeSecondPool
    ) internal {
        (, address token0, address token1) = __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _feeFirstPool});
        (, address token2, address token3) = __getPoolInfo({_tokenA: _tokenB, _tokenB: _tokenC, _fee: _feeSecondPool});

        // mint twice same nft for same tokens
        __mintNft({_token0: token0, _token1: token1, _fee: _feeFirstPool});
        __mintNft({_token0: token0, _token1: token1, _fee: _feeFirstPool});

        // mint nft for different tokens
        __mintNft({_token0: token2, _token1: token3, _fee: _feeSecondPool});

        (address[] memory assets, uint256[] memory amounts) = uniswapV3LiquidityPosition.getManagedAssets();

        // check that assets are correct
        assertEq(assets.length, 3, "Assets length mismatch");
        assertEq(assets[0], token0, "Token0 mismatch");
        assertEq(assets[1], token1, "Token1 mismatch");
        assertEq(assets[2], _tokenC, "Token2 mismatch");

        // check that asset amounts are correct
        assertEq(assets.length, 3, "Asset amounts length mismatch");
        uint256 maxPercentDelta = 1 ether / 200; // 0.5%
        assertApproxEqRel(
            amounts[0], 2 * UNITS_MINTED * assetUnit(IERC20(token0)), maxPercentDelta, "Token amount mismatch"
        );
        assertApproxEqRel(
            amounts[1], 3 * UNITS_MINTED * assetUnit(IERC20(token1)), maxPercentDelta, "Token1 amount mismatch"
        );
        assertApproxEqRel(
            amounts[2], 1 * UNITS_MINTED * assetUnit(IERC20(_tokenC)), maxPercentDelta, "Token2 amount mismatch"
        );
    }

    function __test_managedAssets_aboveRangeSuccess(address _tokenA, address _tokenB, uint24 _fee) internal {
        (IUniswapV3Pool pool, address token0, address token1) =
            __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        (, int24 tick,,,,,) = pool.slot0();
        int24 tickSpacing = pool.tickSpacing();

        __mintNft({
            _token0: token0,
            _token1: token1,
            _fee: _fee,
            _amountDesiredUnits: 100,
            _tickLower: TickMath.MIN_TICK,
            _tickUpper: tick - 200 * tickSpacing
        });

        (address[] memory assets, uint256[] memory amounts) = uniswapV3LiquidityPosition.getManagedAssets();

        // check that assets are correct
        assertEq(assets.length, 2, "Assets length mismatch");
        assertEq(assets[0], token0, "Asset 0 mismatch");
        assertEq(assets[1], token1, "Asset 1 mismatch");

        assertEq(amounts[0], 0, "Amount of token0 should = 0");
        assertGt(amounts[1], 0, "Amount of token1 should be >0");
    }

    function __test_managedAssets_belowRangeSuccess(address _tokenA, address _tokenB, uint24 _fee) internal {
        (IUniswapV3Pool pool, address token0, address token1) =
            __getPoolInfo({_tokenA: _tokenA, _tokenB: _tokenB, _fee: _fee});

        (, int24 tick,,,,,) = pool.slot0();
        int24 tickSpacing = pool.tickSpacing();

        __mintNft({
            _token0: token0,
            _token1: token1,
            _fee: _fee,
            _amountDesiredUnits: 100,
            _tickLower: tick + 200 * tickSpacing,
            _tickUpper: TickMath.MAX_TICK
        });

        (address[] memory assets, uint256[] memory amounts) = uniswapV3LiquidityPosition.getManagedAssets();

        // check that assets are correct
        assertEq(assets.length, 2, "Assets length mismatch");
        assertEq(assets[0], token0, "Asset 0 mismatch");
        assertEq(assets[1], token1, "Asset 1 mismatch");

        assertGt(amounts[0], 0, "Amount of token0 should be > 0");
        assertEq(amounts[1], 0, "Amount of token1 should be = 0");
    }
}

/// @dev Tests work only correctly for stable pools, like DAI/USDC
abstract contract UniswapV3LiquidityPositionTest is
    MintTest,
    AddLiquidityTest,
    CollectTest,
    RemoveLiquidityTest,
    PurgeTest,
    ManagedAssetsTest
{}

contract UniswapV3LiquidityPositionTestEthereum is UniswapV3LiquidityPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment();

        nonFungibleTokenManagerAddress = ETHEREUM_NON_FUNGIBLE_TOKEN_MANAGER;
        factoryAddress = ETHEREUM_FACTORY_ADDRESS;

        super.setUp();
    }

    // MINT
    function test_mint_success() public {
        __test_mint_success({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
        __test_mint_success({_tokenA: ETHEREUM_USDC, _tokenB: ETHEREUM_DAI, _fee: FEE_LOWEST});
        __test_mint_success({_tokenA: ETHEREUM_USDC, _tokenB: ETHEREUM_USDT, _fee: FEE_LOWEST});
    }

    // ADD LIQUIDITY
    function test_addLiquidity_success() public {
        __test_addLiquidity_success({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    // COLLECT
    function test_collect_success() public {
        __test_collect_success({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    // REMOVE LIQUIDITY
    function test_removeLiquidity_success() public {
        __test_removeLiquidity_success({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    // PURGE
    function test_purge_liquidityKnownSuccess() public {
        __test_purge_liquidityKnownUpfrontSuccess({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_liquidityUnknownSuccess() public {
        __test_purge_liquidityUnknownUpfrontSuccess({_tokenA: ETHEREUM_DAI, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_noLiquidityRemovedSuccess() public {
        __test_purge_noLiquidityRemovedSuccess({_tokenA: ETHEREUM_USDT, _tokenB: ETHEREUM_USDC, _fee: FEE_LOWEST});
    }

    // MANAGED ASSETS
    function test_managedAssets_sameNftsAndRelatedNftSuccess() public {
        __test_managedAssets_sameNftsAndRelatedNftSuccess({
            _tokenA: ETHEREUM_DAI,
            _tokenB: ETHEREUM_USDC,
            _feeFirstPool: FEE_LOWEST,
            _tokenC: ETHEREUM_USDT,
            _feeSecondPool: FEE_LOWEST
        });
    }

    function test_managedAssets_aboveRangeSuccess() public {
        __test_managedAssets_aboveRangeSuccess({_tokenA: ETHEREUM_USDC, _tokenB: ETHEREUM_DAI, _fee: FEE_LOWEST});
    }

    function test_managedAssets_belowRangeSuccess() public {
        __test_managedAssets_belowRangeSuccess({_tokenA: ETHEREUM_USDC, _tokenB: ETHEREUM_DAI, _fee: FEE_LOWEST});
    }
}

contract UniswapV3LiquidityPositionTestPolygon is UniswapV3LiquidityPositionTest {
    function setUp() public virtual override {
        setUpPolygonEnvironment();

        nonFungibleTokenManagerAddress = POLYGON_NON_FUNGIBLE_TOKEN_MANAGER;
        factoryAddress = POLYGON_FACTORY_ADDRESS;

        super.setUp();
    }

    // MINT
    function test_mint_success() public {
        __test_mint_success({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
        __test_mint_success({_tokenA: POLYGON_USDC, _tokenB: POLYGON_DAI, _fee: FEE_LOWEST});
    }

    // ADD LIQUIDITY
    function test_addLiquidity_success() public {
        __test_addLiquidity_success({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    // COLLECT
    function test_collect_success() public {
        __test_collect_success({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    // REMOVE LIQUIDITY
    function test_removeLiquidity_success() public {
        __test_removeLiquidity_success({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    // PURGE
    function test_purge_liquidityKnownSuccess() public {
        __test_purge_liquidityKnownUpfrontSuccess({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_liquidityUnknownSuccess() public {
        __test_purge_liquidityUnknownUpfrontSuccess({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_noLiquidityRemovedSuccess() public {
        __test_purge_noLiquidityRemovedSuccess({_tokenA: POLYGON_DAI, _tokenB: POLYGON_USDC, _fee: FEE_LOWEST});
    }

    // MANAGED ASSETS
    function test_managedAssets_sameNftsAndRelatedNftSuccess() public {
        __test_managedAssets_sameNftsAndRelatedNftSuccess({
            _tokenA: POLYGON_USDC,
            _tokenB: POLYGON_DAI,
            _feeFirstPool: FEE_LOWEST,
            _tokenC: POLYGON_USDT,
            _feeSecondPool: FEE_LOWEST
        });
    }

    function test_managedAssets_aboveRangeSuccess() public {
        __test_managedAssets_aboveRangeSuccess({_tokenA: POLYGON_USDC, _tokenB: POLYGON_DAI, _fee: FEE_LOWEST});
    }

    function test_managedAssets_belowRangeSuccess() public {
        __test_managedAssets_belowRangeSuccess({_tokenA: POLYGON_USDC, _tokenB: POLYGON_DAI, _fee: FEE_LOWEST});
    }
}

contract UniswapV3LiquidityPositionTestArbitrum is UniswapV3LiquidityPositionTest {
    function setUp() public virtual override {
        setUpArbitrumEnvironment();

        nonFungibleTokenManagerAddress = ARBITRUM_NON_FUNGIBLE_TOKEN_MANAGER;
        factoryAddress = ARBITRUM_FACTORY_ADDRESS;

        super.setUp();
    }

    // MINT
    function test_mint_success() public {
        __test_mint_success({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
        __test_mint_success({_tokenA: ARBITRUM_USDC, _tokenB: ARBITRUM_DAI, _fee: FEE_LOWEST});
    }

    // ADD LIQUIDITY
    function test_addLiquidity_success() public {
        __test_addLiquidity_success({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    // COLLECT
    function test_collect_success() public {
        __test_collect_success({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    // REMOVE LIQUIDITY
    function test_removeLiquidity_success() public {
        __test_removeLiquidity_success({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    // PURGE
    function test_purge_liquidityKnownSuccess() public {
        __test_purge_liquidityKnownUpfrontSuccess({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_liquidityUnknownSuccess() public {
        __test_purge_liquidityUnknownUpfrontSuccess({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    function test_purge_noLiquidityRemovedSuccess() public {
        __test_purge_noLiquidityRemovedSuccess({_tokenA: ARBITRUM_DAI, _tokenB: ARBITRUM_USDC, _fee: FEE_LOWEST});
    }

    // MANAGED ASSETS
    function test_managedAssets_sameNftsAndRelatedNftSuccess() public {
        __test_managedAssets_sameNftsAndRelatedNftSuccess({
            _tokenA: ARBITRUM_USDC,
            _tokenB: ARBITRUM_DAI,
            _feeFirstPool: FEE_LOWEST,
            _tokenC: ARBITRUM_USDT,
            _feeSecondPool: FEE_LOWEST
        });
    }

    function test_managedAssets_aboveRangeSuccess() public {
        __test_managedAssets_aboveRangeSuccess({_tokenA: ARBITRUM_USDC, _tokenB: ARBITRUM_DAI, _fee: FEE_LOWEST});
    }

    function test_managedAssets_belowRangeSuccess() public {
        __test_managedAssets_belowRangeSuccess({_tokenA: ARBITRUM_USDC, _tokenB: ARBITRUM_DAI, _fee: FEE_LOWEST});
    }
}

contract UniswapV3LiquidityPositionTestEthereumV4 is UniswapV3LiquidityPositionTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract UniswapV3LiquidityPositionTestPolygonV4 is UniswapV3LiquidityPositionTestPolygon {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract UniswapV3LiquidityPositionTestArbitrumV4 is UniswapV3LiquidityPositionTestArbitrum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
