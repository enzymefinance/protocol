// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IMapleLiquidityPosition as IMapleLiquidityPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/maple-liquidity/IMapleLiquidityPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IMapleV2Pool} from "tests/interfaces/external/IMapleV2Pool.sol";
import {IMapleV2PoolManager} from "tests/interfaces/external/IMapleV2PoolManager.sol";
import {IMapleV2ProxyFactory} from "tests/interfaces/external/IMapleV2ProxyFactory.sol";
import {IMapleV2WithdrawalManager} from "tests/interfaces/external/IMapleV2WithdrawalManager.sol";

import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IMapleLiquidityPositionLib} from "tests/interfaces/internal/IMapleLiquidityPositionLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {
    ETHEREUM_MAPLE_V2_GLOBALS_ADDRESS, ETHEREUM_M11_CREDIT_USDC2_POOL_ADDRESS
} from "./MapleLiquidityConstants.sol";

abstract contract TestBase is IntegrationTest {
    event UsedLendingPoolV2Added(address indexed lendingPoolV2);
    event UsedLendingPoolV2Removed(address indexed lendingPoolV2);

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IERC20 internal liquidityAsset;
    IMapleLiquidityPositionLib internal position;
    IMapleV2WithdrawalManager internal mapleWithdrawalManager;

    // Set by child contract
    address internal mapleV2GlobalsAddress;
    IMapleV2Pool internal pool;
    EnzymeVersion internal version;

    function setUp() public virtual override {
        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all dependencies
        uint256 typeId = __deployPositionType({_mapleV2GlobalsAddress: mapleV2GlobalsAddress});

        // Create an empty external position for the fund
        vm.prank(fundOwner);
        position = IMapleLiquidityPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );

        // Assign vars of the pool used throughout
        liquidityAsset = IERC20(pool.asset());
        mapleWithdrawalManager = pool.manager().withdrawalManager();
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (address lib_) {
        return deployCode("MapleLiquidityPositionLib.sol");
    }

    function __deployParser(address _mapleV2GlobalsAddress) internal returns (address parser_) {
        bytes memory args = abi.encode(_mapleV2GlobalsAddress);

        return deployCode("MapleLiquidityPositionParser.sol", args);
    }

    function __deployPositionType(address _mapleV2GlobalsAddress) internal returns (uint256 typeId_) {
        // Deploy type contracts
        address libAddress = __deployLib();

        address parserAddress = __deployParser({_mapleV2GlobalsAddress: _mapleV2GlobalsAddress});

        // Register type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "MAPLE_LIQUIDITY",
            _lib: libAddress,
            _parser: parserAddress
        });

        return (typeId_);
    }

    // ACTION HELPERS

    function __lendV2(address _poolAddress, uint256 _liquidityAssetAmount) internal {
        bytes memory actionArgs = abi.encode(_poolAddress, _liquidityAssetAmount);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(position),
            _actionArgs: actionArgs,
            _actionId: uint256(IMapleLiquidityPositionProd.Actions.LendV2)
        });
    }

    function __requestRedeemV2(address _poolAddress, uint256 _poolTokenAmount) internal {
        bytes memory actionArgs = abi.encode(_poolAddress, _poolTokenAmount);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(position),
            _actionArgs: actionArgs,
            _actionId: uint256(IMapleLiquidityPositionProd.Actions.RequestRedeemV2)
        });
    }

    function __redeemV2(address _poolAddress, uint256 _poolTokenAmount) internal {
        bytes memory actionArgs = abi.encode(_poolAddress, _poolTokenAmount);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(position),
            _actionArgs: actionArgs,
            _actionId: uint256(IMapleLiquidityPositionProd.Actions.RedeemV2)
        });
    }

    function __cancelRedeemV2(address _poolAddress, uint256 _poolTokenAmount) internal {
        bytes memory actionArgs = abi.encode(_poolAddress, _poolTokenAmount);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(position),
            _actionArgs: actionArgs,
            _actionId: uint256(IMapleLiquidityPositionProd.Actions.CancelRedeemV2)
        });
    }

    // MISC HELPERS

    /// @dev Helper to lend the max amount allowed by the pool
    function __lendMaxAllowed() internal returns (uint256 liquidityAssetAmount_) {
        liquidityAssetAmount_ = pool.maxDeposit(vaultProxyAddress);
        assertGt(liquidityAssetAmount_, 0, "Vault cannot deposit anything to pool");

        // increase vault's balance of liquidityAsset
        increaseTokenBalance({_token: liquidityAsset, _to: vaultProxyAddress, _amount: liquidityAssetAmount_});

        // lend to pool
        __lendV2({_poolAddress: address(pool), _liquidityAssetAmount: liquidityAssetAmount_});
    }

    /// @dev Warp to the redemption window start
    function __warpToRedemptionWindow() internal {
        (uint256 redeemWindowStart,) =
            mapleWithdrawalManager.getWindowAtId(mapleWithdrawalManager.exitCycleId(address(position)));
        vm.warp(redeemWindowStart);
    }
}

abstract contract LendTest is TestBase {
    function test_lend_success() public {
        // deposit max to pool
        uint256 liquidityAssetAmount = pool.maxDeposit(vaultProxyAddress);
        uint256 expectedSharesToReceive = pool.convertToShares(liquidityAssetAmount);
        assertGt(expectedSharesToReceive, 0, "Vault cannot deposit anything to pool");

        // increase vault's balance of liquidityAsset
        increaseTokenBalance({_token: liquidityAsset, _to: vaultProxyAddress, _amount: liquidityAssetAmount});

        vm.recordLogs();

        // Assert event was emitted
        expectEmit(address(position));
        emit UsedLendingPoolV2Added(address(pool));

        __lendV2({_poolAddress: address(pool), _liquidityAssetAmount: liquidityAssetAmount});

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // Assert EP storage
        assertEq(position.getUsedLendingPoolsV2(), toArray(address(pool)), "Pool not in array");
        assertTrue(position.isUsedLendingPoolV2(address(pool)), "Pool not marked as used");

        // Assert the expected pool tokens were received for the pool conversion rate pre-deposit
        uint256 poolTokenBalanceAfter = IERC20(address(pool)).balanceOf(address(position));
        assertEq(poolTokenBalanceAfter, expectedSharesToReceive, "Incorrect pool token amount received");

        // Assert the position value matches the pool's reported exit conversion post-deposit
        (address[] memory managedAssets, uint256[] memory managedAmounts) = position.getManagedAssets();
        assertEq(managedAssets, toArray(address(liquidityAsset)), "Incorrect managed assets");
        assertEq(managedAmounts, toArray(pool.convertToExitAssets(poolTokenBalanceAfter)), "Incorrect managed amounts");
    }
}

abstract contract RequestRedeemTest is TestBase {
    function test_requestRedeem_success() public {
        __lendMaxAllowed();

        // request redemption for a portion of pool tokens
        uint256 prePoolTokenBalance = IERC20(address(pool)).balanceOf(address(position));
        uint256 requestRedeemAmount = prePoolTokenBalance / 5;

        vm.recordLogs();
        __requestRedeemV2({_poolAddress: address(pool), _poolTokenAmount: requestRedeemAmount});

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // Assert that the pool token balance decreased and the escrowed shares increased by the same amount
        uint256 postPoolTokenBalance = IERC20(address(pool)).balanceOf(address(position));
        assertEq(postPoolTokenBalance, prePoolTokenBalance - requestRedeemAmount, "Incorrect pool token balance");
        assertEq(mapleWithdrawalManager.lockedShares(address(position)), requestRedeemAmount, "Incorrect locked shares");

        // Assert the position value matches the pool's reported exit conversion post-deposit, including all locked and unlocked shares
        (address[] memory managedAssets, uint256[] memory managedAmounts) = position.getManagedAssets();
        assertEq(managedAssets, toArray(address(liquidityAsset)), "Incorrect managed assets");
        assertEq(
            managedAmounts,
            toArray(pool.convertToExitAssets(postPoolTokenBalance + requestRedeemAmount)),
            "Incorrect managed amounts"
        );
    }
}

abstract contract RedeemTest is TestBase {
    function test_redeem_successForFullRedemption() public {
        __test_redeem_success({_redeemAll: true});
    }

    function test_redeem_successForPartialRedemption() public {
        __test_redeem_success({_redeemAll: false});
    }

    function __test_redeem_success(bool _redeemAll) private {
        __lendMaxAllowed();

        uint256 prePoolTokenAmount = IERC20(address(pool)).balanceOf(address(position));
        uint256 amountToRedeem = _redeemAll ? prePoolTokenAmount : prePoolTokenAmount / 5;
        uint256 expectedLiquidityAssetAmountToReceive = pool.convertToExitAssets(amountToRedeem);

        __requestRedeemV2({_poolAddress: address(pool), _poolTokenAmount: amountToRedeem});

        __warpToRedemptionWindow();

        // If all redeemed, assert event was emitted for pool removal
        if (_redeemAll) {
            expectEmit(address(position));
            emit UsedLendingPoolV2Removed(address(pool));
        }

        vm.recordLogs();
        __redeemV2({_poolAddress: address(pool), _poolTokenAmount: amountToRedeem});

        // Assert assetsToReceive was correctly formatted (liquidity asset in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(liquidityAsset))
        });

        // Assert that the expected amount of liquidity asset was received by the vault
        assertEq(
            liquidityAsset.balanceOf(vaultProxyAddress),
            expectedLiquidityAssetAmountToReceive,
            "Incorrect liquidity asset amount received"
        );

        // Assert pool EP storage, based on whether all pool tokens were redeemed
        address[] memory storedLendingPools = position.getUsedLendingPoolsV2();
        bool isLendingPool = position.isUsedLendingPoolV2(address(pool));
        if (_redeemAll) {
            // Pool should be removed
            assertEq(storedLendingPools, new address[](0), "Pool still in array");
            assertFalse(isLendingPool, "Pool still marked as used");
        } else {
            // Poll should remain
            assertEq(storedLendingPools, toArray(address(pool)), "Pool not in array");
            assertTrue(isLendingPool, "Pool not marked as used");
        }

        // Assert the position value has removed the redeemed pool tokens
        (address[] memory managedAssets, uint256[] memory managedAmounts) = position.getManagedAssets();
        if (_redeemAll) {
            // No more value exits in the EP
            assertEq(managedAssets, new address[](0), "Incorrect managed assets");
        } else {
            assertEq(managedAssets, toArray(address(liquidityAsset)), "Incorrect managed assets");
            assertEq(
                managedAmounts,
                toArray(pool.convertToExitAssets(prePoolTokenAmount - amountToRedeem)),
                "Incorrect managed amounts"
            );
        }
    }
}

abstract contract CancelRedeemTest is TestBase {
    function test_cancelRedeem_success() public {
        __lendMaxAllowed();

        uint256 prePoolTokenBalance = IERC20(address(pool)).balanceOf(address(position));

        // request redeem of some pool tokens
        uint256 requestRedeemAmount = prePoolTokenBalance / 3;
        __requestRedeemV2({_poolAddress: address(pool), _poolTokenAmount: requestRedeemAmount});

        // set time to redeem window start, so we are able to cancel
        __warpToRedemptionWindow();

        vm.recordLogs();
        // cancel part of the redeem request
        uint256 poolTokenAmountToCancel = requestRedeemAmount / 5;
        __cancelRedeemV2({_poolAddress: address(pool), _poolTokenAmount: poolTokenAmountToCancel});

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // Assert that the shares canceled were returned to the EP and that the remainder is still locked
        uint256 finalLockedShares = mapleWithdrawalManager.lockedShares(address(position));
        uint256 finalPoolTokenBalance = IERC20(address(pool)).balanceOf(address(position));
        assertEq(finalLockedShares, requestRedeemAmount - poolTokenAmountToCancel, "Incorrect locked shares");
        assertEq(finalPoolTokenBalance, prePoolTokenBalance - finalLockedShares, "Incorrect pool token balance");
    }
}

// doesn't matter which action we will test, since all of them use the same validation
abstract contract ValidatePoolTest is TestBase {
    function test_validatePoolV2_failsInvalidPoolManagerRelation() public {
        address fakePool = makeAddr("Fake pool");
        address fakePoolManager = makeAddr("Fake pool manager");
        // mock fakePool to return fakePoolManager as its manager
        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(IMapleV2Pool.manager.selector),
            returnData: abi.encode(fakePoolManager)
        });
        // mock fakePoolManager to return wrong pool address
        vm.mockCall({
            callee: fakePoolManager,
            data: abi.encodeWithSelector(IMapleV2PoolManager.pool.selector),
            returnData: abi.encode(makeAddr("Wrong pool address"))
        });

        vm.expectRevert("__validatePoolV2: Invalid PoolManager relation");
        __lendV2({_poolAddress: fakePool, _liquidityAssetAmount: 1});
    }

    function test_validatePoolV2_failsInvalidPoolManagerFactoryRelation() public {
        address fakePool = makeAddr("Fake pool");
        address fakePoolManager = makeAddr("Fake pool manager");
        address fakePoolManagerFactory = makeAddr("Fake pool manager factory");
        // mock fakePool to return fakePoolManager as its manager
        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(IMapleV2Pool.manager.selector),
            returnData: abi.encode(fakePoolManager)
        });
        // mock fakePoolManager to return fakePool address
        vm.mockCall({
            callee: fakePoolManager,
            data: abi.encodeWithSelector(IMapleV2PoolManager.pool.selector),
            returnData: abi.encode(fakePool)
        });
        // mock fakePoolManager to return fakePoolManagerFactory address
        vm.mockCall({
            callee: fakePoolManager,
            data: abi.encodeWithSelector(IMapleV2PoolManager.factory.selector),
            returnData: abi.encode(fakePoolManagerFactory)
        });
        // mock fakePoolManagerFactory to return false when checking if is instance of
        vm.mockCall({
            callee: fakePoolManagerFactory,
            data: abi.encodeWithSelector(IMapleV2ProxyFactory.isInstance.selector),
            returnData: abi.encode(false)
        });

        vm.expectRevert("__validatePoolV2: Invalid PoolManagerFactory relation");
        __lendV2({_poolAddress: fakePool, _liquidityAssetAmount: 1});
    }

    function test_validatePoolV2_failsInvalidGlobalsRelation() public {
        address fakePool = makeAddr("Fake pool");
        address fakePoolManager = makeAddr("Fake pool manager");
        address fakePoolManagerFactory = makeAddr("Fake pool manager factory");
        // mock fakePool to return fakePoolManager as its manager
        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(IMapleV2Pool.manager.selector),
            returnData: abi.encode(fakePoolManager)
        });
        // mock fakePoolManager to return fakePool address
        vm.mockCall({
            callee: fakePoolManager,
            data: abi.encodeWithSelector(IMapleV2PoolManager.pool.selector),
            returnData: abi.encode(fakePool)
        });
        // mock fakePoolManager to return fakePoolManagerFactory address
        vm.mockCall({
            callee: fakePoolManager,
            data: abi.encodeWithSelector(IMapleV2PoolManager.factory.selector),
            returnData: abi.encode(fakePoolManagerFactory)
        });
        // mock fakePoolManagerFactory to return true when checking if is instance
        vm.mockCall({
            callee: fakePoolManagerFactory,
            data: abi.encodeWithSelector(IMapleV2ProxyFactory.isInstance.selector),
            returnData: abi.encode(true)
        });

        vm.expectRevert("__validatePoolV2: Invalid Globals relation");
        __lendV2({_poolAddress: fakePool, _liquidityAssetAmount: 1});
    }
}

abstract contract PositionTest is LendTest, RequestRedeemTest, RedeemTest, CancelRedeemTest, ValidatePoolTest {}

contract MapleLiquidityPositionEthereum is PositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment(18691012); // TODO: update to this global latest block number
        mapleV2GlobalsAddress = ETHEREUM_MAPLE_V2_GLOBALS_ADDRESS;
        pool = IMapleV2Pool(ETHEREUM_M11_CREDIT_USDC2_POOL_ADDRESS);

        super.setUp();
    }
}
//

contract MapleLiquidityPositionEthereumV4 is MapleLiquidityPositionEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
