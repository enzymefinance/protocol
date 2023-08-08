// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV3PoolAddressProvider} from "tests/interfaces/external/IAaveV3PoolAddressProvider.sol";
import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {IAaveV3ProtocolDataProvider} from "tests/interfaces/external/IAaveV3ProtocolDataProvider.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV3DebtPositionLib} from "tests/interfaces/internal/IAaveV3DebtPositionLib.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {
    ETHEREUM_POOL_ADDRESS_PROVIDER,
    ETHEREUM_PROTOCOL_DATA_PROVIDER,
    POLYGON_POOL_ADDRESS_PROVIDER,
    POLYGON_PROTOCOL_DATA_PROVIDER
} from "./AaveV3Constants.sol";
import {AaveV3Utils} from "./AaveV3Utils.sol";

enum Actions {
    AddCollateral,
    RemoveCollateral,
    Borrow,
    RepayBorrow,
    SetEMode,
    SetUseReserveAsCollateral
}

abstract contract TestBase is IntegrationTest, AaveV3Utils {
    event BorrowedAssetAdded(address indexed asset);
    event BorrowedAssetRemoved(address indexed asset);
    event CollateralAssetAdded(address indexed asset);
    event CollateralAssetRemoved(address indexed asset);

    address internal fundOwner = makeAddr("fundOwner");

    IVaultLib internal vaultProxy;
    IComptrollerLib internal comptrollerProxy;

    IAaveV3DebtPositionLib internal aaveV3DebtPosition;
    IAaveV3PoolAddressProvider internal poolAddressProvider;
    IAaveV3ProtocolDataProvider internal protocolDataProvider;
    IAaveV3Pool internal lendingPool;

    function setUp() public virtual override {
        lendingPool = IAaveV3PoolAddressProvider(poolAddressProvider).getPool();

        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: fundOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether,
            _sharesBuyer: fundOwner
        });

        // Deploy all AaveV3Debt dependencies
        uint256 typeId = __deployPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _poolAddressProvider: poolAddressProvider,
            _protocolDataProvider: protocolDataProvider,
            _addressListRegistry: core.persistent.addressListRegistry
        });

        // Create an empty AaveV3Debt for the fund
        vm.prank(fundOwner);
        aaveV3DebtPosition = IAaveV3DebtPositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: typeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );
    }

    // DEPLOYMENT HELPERS
    function __deployLib(
        IAaveV3PoolAddressProvider _poolAddressProvider,
        IAaveV3ProtocolDataProvider _protocolDataProvider,
        uint16 _referralCode
    ) internal returns (address lib_) {
        bytes memory args = abi.encode(_protocolDataProvider, _poolAddressProvider, _referralCode);

        return deployCode("AaveV3DebtPositionLib.sol", args);
    }

    function __deployParser(IAddressListRegistry _addressListRegistry, uint256 _aTokenListId)
        internal
        returns (address parser_)
    {
        bytes memory args = abi.encode(_addressListRegistry, _aTokenListId);

        return deployCode("AaveV3DebtPositionParser.sol", args);
    }

    function __deployPositionType(
        IExternalPositionManager _externalPositionManager,
        IAaveV3PoolAddressProvider _poolAddressProvider,
        IAaveV3ProtocolDataProvider _protocolDataProvider,
        IAddressListRegistry _addressListRegistry
    ) internal returns (uint256 typeId_) {
        // Deploy Aave V3 Debt type contracts
        address aaveV3DebtPositionLibAddress = address(
            __deployLib({
                _poolAddressProvider: _poolAddressProvider,
                _protocolDataProvider: _protocolDataProvider,
                _referralCode: 0
            })
        );

        (, uint256 aTokenListId) = deployAaveV3ATokenListOwner({
            _addressListRegistry: _addressListRegistry,
            _lendingPoolAddressProvider: address(_poolAddressProvider)
        });

        address aaveV3DebtPositionParser =
            address(__deployParser({_addressListRegistry: _addressListRegistry, _aTokenListId: aTokenListId}));

        // Register AaveV3Debt type
        typeId_ = registerExternalPositionType({
            _externalPositionManager: _externalPositionManager,
            _label: "AAVE_V3_DEBT",
            _lib: aaveV3DebtPositionLibAddress,
            _parser: aaveV3DebtPositionParser
        });

        return (typeId_);
    }

    // ACTION HELPERS

    function __addCollateral(address[] memory _aTokens, uint256[] memory _amounts, bool _fromUnderlying) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts, _fromUnderlying);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.AddCollateral)
        });
    }

    function __removeCollateral(address[] memory _aTokens, uint256[] memory _amounts, bool _toUnderlying) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts, _toUnderlying);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.RemoveCollateral)
        });
    }

    function __borrowAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.Borrow)
        });
    }

    function __repayBorrowedAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.RepayBorrow)
        });
    }

    function __setEMode(uint8 _categoryId) internal {
        bytes memory actionArgs = abi.encode(_categoryId);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.SetEMode)
        });
    }

    function __setUseReserveAsCollateral(address _underlying, bool _useAsCollateral) internal {
        bytes memory actionArgs = abi.encode(_underlying, _useAsCollateral);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.SetUseReserveAsCollateral)
        });
    }

    // MISC HELPERS

    function __getATokenAddress(address _underlying) internal view returns (address aTokenAddress_) {
        return getATokenAddress({_lendingPool: address(lendingPool), _underlying: _underlying});
    }

    function __getATokensAddresses(address[] memory _underlyings) internal view returns (address[] memory aTokens_) {
        aTokens_ = new address[](_underlyings.length);

        for (uint256 i = 0; i < _underlyings.length; i++) {
            aTokens_[i] = __getATokenAddress({_underlying: _underlyings[i]});
        }
        return aTokens_;
    }

    function __registerUnderlyingsAndATokensForThem(address[] memory _underlyingAddresses) internal {
        registerUnderlyingsAndATokensForThem({
            _valueInterpreter: core.release.valueInterpreter,
            _underlyings: _underlyingAddresses,
            _lendingPool: address(lendingPool)
        });
    }

    function __dealATokenAndAddCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase tokens balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: address(vaultProxy), _amount: _amounts[i]});
        }

        __addCollateral({_aTokens: _aTokens, _amounts: _amounts, _fromUnderlying: false});
    }

    // inspired by https://github.com/aave/aave-v3-core/blob/29ff9b9f89af7cd8255231bc5faf26c3ce0fb7ce/contracts/protocol/libraries/configuration/UserConfiguration.sol#L103
    function __isUsingAsCollateral(IAaveV3Pool.UserConfigurationMap memory _userConfigurationMap, uint256 _reserveIndex)
        internal
        pure
        returns (bool isUsingAsCollateral_)
    {
        unchecked {
            return (_userConfigurationMap.data >> ((_reserveIndex << 1) + 1)) & 1 != 0;
        }
    }
}

abstract contract AddCollateralTest is TestBase {
    function __test_addCollateral_success(address[] memory _aTokens, uint256[] memory _amounts, bool _fromUnderlying)
        internal
    {
        // increase tokens balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            if (_fromUnderlying) {
                increaseTokenBalance({
                    _token: IERC20(IAaveAToken(_aTokens[i]).UNDERLYING_ASSET_ADDRESS()),
                    _to: address(vaultProxy),
                    _amount: _amounts[i]
                });
            } else {
                increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: address(vaultProxy), _amount: _amounts[i]});
            }
        }

        (address[] memory uniqueATokens, uint256[] memory uniqueATokensAmounts) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amounts, _ceilingAtMax: true});

        // expect emit add collateral event for every added token
        for (uint256 i = 0; i < uniqueATokens.length; i++) {
            expectEmit(address(aaveV3DebtPosition));
            emit CollateralAssetAdded(uniqueATokens[i]);
        }

        vm.recordLogs();

        __addCollateral({_aTokens: _aTokens, _amounts: _amounts, _fromUnderlying: _fromUnderlying});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        for (uint256 i = 0; i < _aTokens.length; i++) {
            assertTrue(aaveV3DebtPosition.assetIsCollateral(_aTokens[i]), "Asset is not collateral");
        }

        (address[] memory managedAssets, uint256[] memory managedAmounts) = aaveV3DebtPosition.getManagedAssets();

        assertEq(managedAssets, uniqueATokens, "Invalid managed assets");

        for (uint256 i = 0; i < managedAmounts.length; i++) {
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(managedAmounts[i], uniqueATokensAmounts[i], 1, "Invalid managed amounts");
        }
    }

    function test_addCollateral_failNotSupportedAssetAddCollateral() public {
        // error will have no message as unsupported asset has no UNDERLYING_ASSET_ADDRESS method
        vm.expectRevert();

        __addCollateral({_aTokens: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1), _fromUnderlying: false});
    }
}

abstract contract RemoveCollateralTest is TestBase {
    function __test_removeCollateral_success(
        address[] memory _aTokens,
        uint256[] memory _amountsToAdd,
        uint256[] memory _amountsToRemove,
        bool _toUnderlying
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokens, _amounts: _amountsToAdd});

        (, uint256[] memory uniqueAmountsToAdd) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amountsToAdd, _ceilingAtMax: false});

        (address[] memory uniqueATokensToRemove, uint256[] memory uniqueAmountsToRemove) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amountsToRemove, _ceilingAtMax: true});

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // expect emit remove collateral event for every fully-removed token
            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                expectEmit(address(aaveV3DebtPosition));
                emit CollateralAssetRemoved(uniqueATokensToRemove[i]);
            }
        }

        vm.recordLogs();

        __removeCollateral({_aTokens: _aTokens, _amounts: _amountsToRemove, _toUnderlying: _toUnderlying});

        address[] memory assetsToReceive = new address[](_aTokens.length);
        for (uint256 i; i < assetsToReceive.length; i++) {
            assetsToReceive[i] = _toUnderlying ? IAaveAToken(_aTokens[i]).UNDERLYING_ASSET_ADDRESS() : _aTokens[i];
        }
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: assetsToReceive
        });

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // assert external position storage removes collateral asset for every fully-removed token
            // and check the external position balances are reflecting the removed collateral

            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                assertFalse(aaveV3DebtPosition.assetIsCollateral(uniqueATokensToRemove[i]), "Asset is collateral");
                assertEq(
                    IERC20(uniqueATokensToRemove[i]).balanceOf(address(aaveV3DebtPosition)),
                    0,
                    "AToken was not fully-withdrawn"
                );
            } else {
                // 1 wei difference is allowed because of the interest accrued
                assertApproxEqAbs(
                    IERC20(uniqueATokensToRemove[i]).balanceOf(address(aaveV3DebtPosition)),
                    uniqueAmountsToAdd[i] - uniqueAmountsToRemove[i],
                    1,
                    "AToken was not partially-withdrawn in the expected amount"
                );
            }

            uint256 expectedVaultBalance =
                uniqueAmountsToRemove[i] == type(uint256).max ? uniqueAmountsToAdd[i] : uniqueAmountsToRemove[i];

            IERC20 removedAsset = IERC20(
                _toUnderlying
                    ? IAaveAToken(uniqueATokensToRemove[i]).UNDERLYING_ASSET_ADDRESS()
                    : uniqueATokensToRemove[i]
            );
            // check that vault received removed collateral
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(
                removedAsset.balanceOf(address(vaultProxy)),
                expectedVaultBalance,
                1,
                "Vault did not receive removed collateral"
            );
        }
    }

    function test_removeCollateral_failInvalidCollateralAsset() public {
        vm.expectRevert(formatError("__removeCollateralAssets: Invalid collateral asset"));

        __removeCollateral({
            _aTokens: toArray(makeAddr("InvalidCollateralAsset")),
            _amounts: toArray(1),
            _toUnderlying: false
        });
    }
}

abstract contract BorrowTest is TestBase {
    function __test_borrow_success(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _underlyingsToBorrow,
        uint256[] memory _underlyingsToBorrowAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        (address[] memory uniqueUnderlyingsToBorrow, uint256[] memory uniqueUnderlyingsToBorrowAmounts) =
        aggregateAssetAmounts({
            _rawAssets: _underlyingsToBorrow,
            _rawAmounts: _underlyingsToBorrowAmounts,
            _ceilingAtMax: false
        });

        // expect the correct event for every unique borrowed token
        for (uint256 i = 0; i < uniqueUnderlyingsToBorrow.length; i++) {
            expectEmit(address(aaveV3DebtPosition));
            emit BorrowedAssetAdded(uniqueUnderlyingsToBorrow[i]);
        }

        vm.recordLogs();

        __borrowAssets({_underlyings: _underlyingsToBorrow, _amounts: _underlyingsToBorrowAmounts});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: _underlyingsToBorrow
        });

        // assert external position storage saves the borrowed assets
        for (uint256 i = 0; i < uniqueUnderlyingsToBorrow.length; i++) {
            assertTrue(aaveV3DebtPosition.assetIsBorrowed(uniqueUnderlyingsToBorrow[i]), "Asset is not borrowed");
        }

        // Assert position value
        (address[] memory debtAssets, uint256[] memory debtAmounts) = aaveV3DebtPosition.getDebtAssets();

        // check the debt assets match the borrowed assets
        assertEq(debtAssets, uniqueUnderlyingsToBorrow, "Invalid debt assets");

        for (uint256 i = 0; i < debtAmounts.length; i++) {
            // debt can already accrue interest, that's why we allow a 1 wei difference
            assertApproxEqAbs(debtAmounts[i], uniqueUnderlyingsToBorrowAmounts[i], 1, "Invalid debt amount");
        }

        // check the borrowed assets vault balance
        for (uint256 i = 0; i < uniqueUnderlyingsToBorrow.length; i++) {
            assertEq(
                IERC20(uniqueUnderlyingsToBorrow[i]).balanceOf(address(vaultProxy)),
                uniqueUnderlyingsToBorrowAmounts[i],
                "Borrowed asset amount was not sent to the vault"
            );
        }
    }
}

abstract contract RepayBorrowTest is TestBase {
    function __test_repayBorrow_success(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _underlyingsToBorrowAndRepay,
        uint256[] memory _underlyingsToBorrowAmounts,
        uint256[] memory _underlyingsVaultAmounts,
        uint256[] memory _underlyingsToRepayAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        __borrowAssets({_underlyings: _underlyingsToBorrowAndRepay, _amounts: _underlyingsToBorrowAmounts});

        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            // set vault balances with amounts
            deal({token: _underlyingsToBorrowAndRepay[i], give: _underlyingsVaultAmounts[i], to: address(vaultProxy)});
        }

        // expect emit borrowed asset removed event for every fully-repaid token
        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            if (_underlyingsToBorrowAmounts[i] <= _underlyingsToRepayAmounts[i]) {
                expectEmit(address(aaveV3DebtPosition));
                emit BorrowedAssetRemoved(_underlyingsToBorrowAndRepay[i]);
            }
        }

        vm.recordLogs();

        __repayBorrowedAssets({_underlyings: _underlyingsToBorrowAndRepay, _amounts: _underlyingsToRepayAmounts});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            // check the vault balance is correct after repay
            // if the repay amount is greater than the borrowed amount the vault balance should be decreased by the borrowed amount
            // if the repay amount is less than the borrowed amount the vault balance should be decreased by the repay amount
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(
                IERC20(_underlyingsToBorrowAndRepay[i]).balanceOf(address(vaultProxy)),
                _underlyingsVaultAmounts[i] - Math.min(_underlyingsToBorrowAmounts[i], _underlyingsToRepayAmounts[i]),
                1,
                "Vault balance is not correct after repay"
            );

            if (_underlyingsToRepayAmounts[i] >= _underlyingsToBorrowAmounts[i]) {
                // check that the EP no longer considers fully-repaid tokens as borrowed
                assertFalse(
                    aaveV3DebtPosition.assetIsBorrowed(_underlyingsToBorrowAndRepay[i]), "Asset is still borrowed"
                );
            } else {
                // check that the debt decreased
                // 1 wei difference is allowed because of the interest accrued if the colletaral is supplied is the same as borrowed asset
                assertApproxEqAbs(
                    IERC20(aaveV3DebtPosition.getDebtTokenForBorrowedAsset(_underlyingsToBorrowAndRepay[i])).balanceOf(
                        address(aaveV3DebtPosition)
                    ),
                    _underlyingsToBorrowAmounts[i] - _underlyingsToRepayAmounts[i],
                    1,
                    "Invalid debt amount"
                );
                // check that the EP has still not fully-repaid tokens as borrowed
                assertTrue(aaveV3DebtPosition.assetIsBorrowed(_underlyingsToBorrowAndRepay[i]), "Asset is not borrowed");
            }
        }
    }

    function test_repayBorrow_failRepayTokenNotBorrowed() public {
        IERC20 invalidAsset = createTestToken();

        vm.expectRevert(formatError("__repayBorrowedAssets: Invalid borrowed asset"));

        __repayBorrowedAssets({_underlyings: toArray(address(invalidAsset)), _amounts: toArray(uint256(0))});
    }
}

abstract contract SetEModeTest is TestBase {
    function test_setEMode_success() public {
        vm.recordLogs();

        uint8 categoryId = 1;
        // both polygon and ethereum have category id 1
        __setEMode(categoryId);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        // verify that the category id is set for external position
        assertEq(lendingPool.getUserEMode(address(aaveV3DebtPosition)), categoryId, "Invalid category id");
    }
}

abstract contract SetUseReserveAsCollateral is TestBase {
    function __test_setUseReserveAsCollateral_success(address _underlying) internal {
        // get reserve data about underlying
        IAaveV3Pool.ReserveData memory reserveData = lendingPool.getReserveData(_underlying);

        // get user configuration before enabling underlying as collateral
        IAaveV3Pool.UserConfigurationMap memory userConfigurationMapBefore =
            lendingPool.getUserConfiguration(address(aaveV3DebtPosition));

        // check that the underlying is NOT enabled as collateral
        assertFalse(
            __isUsingAsCollateral({_userConfigurationMap: userConfigurationMapBefore, _reserveIndex: reserveData.id}),
            "Underlying is enabled as collateral"
        );

        // add as colletaral minimum 1 wei to be able to enable underlying as collateral
        __dealATokenAndAddCollateral({_aTokens: toArray(__getATokenAddress(_underlying)), _amounts: toArray(1)});

        vm.recordLogs();

        // enable underlying as collateral
        __setUseReserveAsCollateral({_underlying: _underlying, _useAsCollateral: true});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        // get user configuration after enabling underlying as collateral
        IAaveV3Pool.UserConfigurationMap memory userConfigurationMapAfter =
            lendingPool.getUserConfiguration(address(aaveV3DebtPosition));

        // check that the underlying is enabled as collateral
        assertTrue(
            __isUsingAsCollateral({_userConfigurationMap: userConfigurationMapAfter, _reserveIndex: reserveData.id}),
            "Underlying is not enabled as collateral"
        );
    }
}

// Normally in this place there would be tests for getManagedAssets, and getDebtAssets, but in Aave's case it is very straightforward, i.e., there is only one kind of managed asset with one way of calculating it, and same for debt assets.
// Therefore, we don't need to test it.

abstract contract AaveV3DebtPositionTest is
    SetUseReserveAsCollateral,
    SetEModeTest,
    RepayBorrowTest,
    BorrowTest,
    AddCollateralTest,
    RemoveCollateralTest
{}

contract AaveV3DebtPositionTestEthereum is AaveV3DebtPositionTest {
    function setUp() public override {
        setUpMainnetEnvironment();

        poolAddressProvider = IAaveV3PoolAddressProvider(ETHEREUM_POOL_ADDRESS_PROVIDER);
        protocolDataProvider = IAaveV3ProtocolDataProvider(ETHEREUM_PROTOCOL_DATA_PROVIDER);

        super.setUp();

        // set up all underlyings used in test cases
        __registerUnderlyingsAndATokensForThem(
            toArray(ETHEREUM_WBTC, ETHEREUM_WSTETH, ETHEREUM_DAI, ETHEREUM_USDC, ETHEREUM_BAL)
        );
    }

    function test_addCollateral_success() public {
        address[] memory underlyings = toArray(ETHEREUM_WBTC, ETHEREUM_DAI, ETHEREUM_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({
            _aTokens: __getATokensAddresses(underlyings),
            _amounts: amounts,
            _fromUnderlying: false
        });
    }

    function test_addCollateralFromUnderlying_success() public {
        address[] memory underlyings = toArray(ETHEREUM_WBTC, ETHEREUM_DAI, ETHEREUM_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({
            _aTokens: __getATokensAddresses(underlyings),
            _amounts: amounts,
            _fromUnderlying: true
        });
    }

    function test_removeCollateralToATokens_success() public {
        __test_removeCollateral_success({_toUnderlying: true});
    }

    function test_removeCollateralToUnderlyings_success() public {
        __test_removeCollateral_success({_toUnderlying: false});
    }

    function test_borrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrow = new address[](3);
        underlyingsToBorrow[0] = ETHEREUM_USDC;
        underlyingsToBorrow[1] = ETHEREUM_WSTETH;
        underlyingsToBorrow[2] = ETHEREUM_WSTETH;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrow[0]));
        underlyingsToBorrowAmounts[1] = 1 * assetUnit(IERC20(underlyingsToBorrow[1]));
        underlyingsToBorrowAmounts[2] = 2 * assetUnit(IERC20(underlyingsToBorrow[2]));

        __test_borrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrow: underlyingsToBorrow,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts
        });
    }

    function test_repayBorrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrowAndRepay = new address[](3);
        underlyingsToBorrowAndRepay[0] = ETHEREUM_USDC;
        underlyingsToBorrowAndRepay[1] = ETHEREUM_WSTETH;
        underlyingsToBorrowAndRepay[2] = ETHEREUM_WBTC;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToBorrowAmounts[1] = 2 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsToBorrowAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsToRepayAmounts = new uint256[](3);
        underlyingsToRepayAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToRepayAmounts[1] = type(uint256).max;
        underlyingsToRepayAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsVaultAmounts = new uint256[](3);
        underlyingsVaultAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsVaultAmounts[1] = 2 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsVaultAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        __test_repayBorrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrowAndRepay: underlyingsToBorrowAndRepay,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts,
            _underlyingsVaultAmounts: underlyingsVaultAmounts,
            _underlyingsToRepayAmounts: underlyingsToRepayAmounts
        });
    }

    function test_setUseReserveAsCollateral_success() public {
        __test_setUseReserveAsCollateral_success({_underlying: ETHEREUM_BAL});
    }

    function __test_removeCollateral_success(bool _toUnderlying) internal {
        address[] memory aTokens = new address[](5);
        aTokens[0] = __getATokenAddress(ETHEREUM_WBTC);
        aTokens[1] = __getATokenAddress(ETHEREUM_WSTETH);
        aTokens[2] = __getATokenAddress(ETHEREUM_WSTETH);
        aTokens[3] = __getATokenAddress(ETHEREUM_DAI);
        aTokens[4] = __getATokenAddress(ETHEREUM_USDC);

        uint256[] memory amountsToAdd = new uint256[](5);
        amountsToAdd[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToAdd[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToAdd[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToAdd[3] = 10_000 * assetUnit(IERC20(aTokens[3]));
        amountsToAdd[4] = 15_000 * assetUnit(IERC20(aTokens[4]));

        uint256[] memory amountsToRemove = new uint256[](5);
        amountsToRemove[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToRemove[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToRemove[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToRemove[3] = type(uint256).max;
        amountsToRemove[4] = 10_000 * assetUnit(IERC20(aTokens[4]));

        __test_removeCollateral_success({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove,
            _toUnderlying: _toUnderlying
        });
    }
}

contract AaveV3DebtPositionTestPolygon is AaveV3DebtPositionTest {
    function setUp() public override {
        setUpPolygonEnvironment();

        poolAddressProvider = IAaveV3PoolAddressProvider(POLYGON_POOL_ADDRESS_PROVIDER);
        protocolDataProvider = IAaveV3ProtocolDataProvider(POLYGON_PROTOCOL_DATA_PROVIDER);

        super.setUp();

        // set up all underlyings used in test cases
        __registerUnderlyingsAndATokensForThem(
            toArray(POLYGON_WBTC, POLYGON_LINK, POLYGON_DAI, POLYGON_USDC, POLYGON_USDT)
        );
    }

    function test_addCollateral_success() public {
        address[] memory underlyings = toArray(POLYGON_LINK, POLYGON_DAI, POLYGON_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({
            _aTokens: __getATokensAddresses(underlyings),
            _amounts: amounts,
            _fromUnderlying: false
        });
    }

    function test_addCollateralFromUnderlying_success() public {
        address[] memory underlyings = toArray(POLYGON_LINK, POLYGON_DAI, POLYGON_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({
            _aTokens: __getATokensAddresses(underlyings),
            _amounts: amounts,
            _fromUnderlying: true
        });
    }

    function test_removeCollateralToATokens_success() public {
        __test_removeCollateral_success({_toUnderlying: true});
    }

    function test_removeCollateralToUnderlyings_success() public {
        __test_removeCollateral_success({_toUnderlying: false});
    }

    function test_borrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrow = new address[](3);
        underlyingsToBorrow[0] = POLYGON_USDC;
        underlyingsToBorrow[1] = POLYGON_LINK;
        underlyingsToBorrow[2] = POLYGON_LINK;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrow[0]));
        underlyingsToBorrowAmounts[1] = 1 * assetUnit(IERC20(underlyingsToBorrow[1]));
        underlyingsToBorrowAmounts[2] = 2 * assetUnit(IERC20(underlyingsToBorrow[2]));

        __test_borrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrow: underlyingsToBorrow,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts
        });
    }

    function test_repayBorrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrowAndRepay = new address[](3);
        underlyingsToBorrowAndRepay[0] = POLYGON_USDC;
        underlyingsToBorrowAndRepay[1] = POLYGON_LINK;
        underlyingsToBorrowAndRepay[2] = POLYGON_WBTC;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToBorrowAmounts[1] = 2 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsToBorrowAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsVaultAmounts = new uint256[](3);
        underlyingsVaultAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsVaultAmounts[1] = 3 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsVaultAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsToRepayAmounts = new uint256[](3);
        underlyingsToRepayAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToRepayAmounts[1] = type(uint256).max;
        underlyingsToRepayAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        __test_repayBorrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrowAndRepay: underlyingsToBorrowAndRepay,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts,
            _underlyingsVaultAmounts: underlyingsVaultAmounts,
            _underlyingsToRepayAmounts: underlyingsToRepayAmounts
        });
    }

    function test_setUseReserveAsCollateral_success() public {
        __test_setUseReserveAsCollateral_success({_underlying: POLYGON_USDT});
    }

    function __test_removeCollateral_success(bool _toUnderlying) internal {
        address[] memory aTokens = new address[](5);
        aTokens[0] = __getATokenAddress(POLYGON_WBTC);
        aTokens[1] = __getATokenAddress(POLYGON_LINK);
        aTokens[2] = __getATokenAddress(POLYGON_LINK);
        aTokens[3] = __getATokenAddress(POLYGON_DAI);
        aTokens[4] = __getATokenAddress(POLYGON_USDC);

        uint256[] memory amountsToAdd = new uint256[](5);
        amountsToAdd[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToAdd[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToAdd[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToAdd[3] = 10_000 * assetUnit(IERC20(aTokens[3]));
        amountsToAdd[4] = 15_000 * assetUnit(IERC20(aTokens[4]));

        uint256[] memory amountsToRemove = new uint256[](5);
        amountsToRemove[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToRemove[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToRemove[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToRemove[3] = type(uint256).max;
        amountsToRemove[4] = 10_000 * assetUnit(IERC20(aTokens[4]));

        __test_removeCollateral_success({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove,
            _toUnderlying: _toUnderlying
        });
    }
}
