// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveV3DebtPosition as IAaveV3DebtPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/aave-v3-debt/IAaveV3DebtPosition.sol";

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {IAaveV3PoolAddressProvider} from "tests/interfaces/external/IAaveV3PoolAddressProvider.sol";
import {IAaveV3PriceOracle} from "tests/interfaces/external/IAaveV3PriceOracle.sol";
import {IAaveV3ProtocolDataProvider} from "tests/interfaces/external/IAaveV3ProtocolDataProvider.sol";
import {IAaveV3RewardsController} from "tests/interfaces/external/IAaveV3RewardsController.sol";
import {IMerklCore} from "tests/interfaces/external/IMerklCore.sol";
import {IMerklDistributor} from "tests/interfaces/external/IMerklDistributor.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {IAaveV3DebtPositionLib} from "tests/interfaces/internal/IAaveV3DebtPositionLib.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

import {AaveV3Utils} from "./AaveV3Utils.sol";

abstract contract TestBase is IntegrationTest, AaveV3Utils {
    event BorrowedAssetAdded(address indexed asset);
    event BorrowedAssetRemoved(address indexed asset);
    event CollateralAssetAdded(address indexed asset);
    event CollateralAssetRemoved(address indexed asset);

    address fundOwner;
    address vaultProxyAddress;
    address comptrollerProxyAddress;

    EnzymeVersion version;
    IAaveV3DebtPositionLib aaveV3DebtPosition;
    IAaveV3PoolAddressProvider poolAddressProvider;
    IAaveV3ProtocolDataProvider protocolDataProvider;
    IAaveV3RewardsController rewardsController;
    IAaveV3Pool lendingPool;
    IAaveV3PriceOracle priceOracle;
    IMerklDistributor merklDistributor;

    address[] collateralUnderlyingAddresses;
    address[] borrowableUnderlyingAddresses;
    address rewardedCollateralUnderlyingAddress;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        IMerklDistributor _merklDistributor,
        IAaveV3PoolAddressProvider _poolAddressProvider,
        IAaveV3ProtocolDataProvider _protocolDataProvider,
        IAaveV3RewardsController _rewardsController,
        address[] memory _collateralUnderlyingAddresses,
        address[] memory _borrowableUnderlyingAddresses,
        address _rewardedCollateralUnderlyingAddress
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        version = _version;
        merklDistributor = _merklDistributor;
        poolAddressProvider = _poolAddressProvider;
        protocolDataProvider = _protocolDataProvider;
        rewardsController = _rewardsController;
        lendingPool = poolAddressProvider.getPool();
        priceOracle = IAaveV3PriceOracle(poolAddressProvider.getPriceOracle());

        borrowableUnderlyingAddresses = _borrowableUnderlyingAddresses;
        collateralUnderlyingAddresses = _collateralUnderlyingAddresses;
        rewardedCollateralUnderlyingAddress = _rewardedCollateralUnderlyingAddress;

        // Register all underlyings used in test cases
        __registerUnderlyingsAndATokensForThem(_collateralUnderlyingAddresses);

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all AaveV3Debt dependencies
        uint256 typeId = __deployPositionType({
            _poolAddressProvider: poolAddressProvider,
            _protocolDataProvider: protocolDataProvider,
            _merklDistributor: _merklDistributor,
            _rewardsController: rewardsController,
            _addressListRegistry: core.persistent.addressListRegistry
        });

        // Create an empty AaveV3Debt for the fund
        vm.prank(fundOwner);
        aaveV3DebtPosition = IAaveV3DebtPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS
    function __deployLib(
        IMerklDistributor _merklDistributor,
        IAaveV3PoolAddressProvider _poolAddressProvider,
        IAaveV3ProtocolDataProvider _protocolDataProvider,
        uint16 _referralCode,
        IAaveV3RewardsController _rewardsController
    ) internal returns (address lib_) {
        bytes memory args = abi.encode(
            _protocolDataProvider, _poolAddressProvider, _merklDistributor, _referralCode, _rewardsController
        );

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
        IMerklDistributor _merklDistributor,
        IAaveV3PoolAddressProvider _poolAddressProvider,
        IAaveV3ProtocolDataProvider _protocolDataProvider,
        IAaveV3RewardsController _rewardsController,
        IAddressListRegistry _addressListRegistry
    ) internal returns (uint256 typeId_) {
        // Deploy Aave V3 Debt type contracts
        address aaveV3DebtPositionLibAddress = address(
            __deployLib({
                _poolAddressProvider: _poolAddressProvider,
                _protocolDataProvider: _protocolDataProvider,
                _merklDistributor: _merklDistributor,
                _rewardsController: _rewardsController,
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
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
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
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.AddCollateral)
        });
    }

    function __removeCollateral(address[] memory _aTokens, uint256[] memory _amounts, bool _toUnderlying) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts, _toUnderlying);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.RemoveCollateral)
        });
    }

    function __borrowAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.Borrow)
        });
    }

    function __repayBorrowedAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.RepayBorrow)
        });
    }

    function __setEMode(uint8 _categoryId) internal {
        bytes memory actionArgs = abi.encode(_categoryId);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.SetEMode)
        });
    }

    function __setUseReserveAsCollateral(address _underlying, bool _useAsCollateral) internal {
        bytes memory actionArgs = abi.encode(_underlying, _useAsCollateral);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.SetUseReserveAsCollateral)
        });
    }

    function __claimRewards(address[] memory _assets, uint256 _amount, address _rewardToken) internal {
        bytes memory actionArgs = abi.encode(_assets, _amount, _rewardToken);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.ClaimRewards)
        });
    }

    function __sweep(address[] memory _assets) internal {
        bytes memory actionArgs = abi.encode(_assets);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.Sweep)
        });
    }

    function __claimMerklRewards(address[] memory _tokens, uint256[] memory _amounts, bytes32[][] memory _proofs)
        internal
    {
        bytes memory actionArgs = abi.encode(_tokens, _amounts, _proofs);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveV3DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveV3DebtPositionProd.Actions.ClaimMerklRewards)
        });
    }

    // MISC HELPERS

    function __calcCollateralValueOfBorrowedAssets(
        address[] memory _borrowedAssetAddresses,
        uint256[] memory _borrowedAssetAmounts,
        address _collateralUnderlyingAddress
    ) internal returns (uint256 collateralValue_) {
        uint256 borrowedAssetsValue;
        for (uint256 i; i < _borrowedAssetAddresses.length; i++) {
            IERC20 borrowAsset = IERC20(_borrowedAssetAddresses[i]);
            uint256 borrowAmount = _borrowedAssetAmounts[i];

            uint256 borrowAssetPrice = priceOracle.getAssetPrice(address(borrowAsset));
            assertGt(borrowAssetPrice, 0, "Invalid borrow asset price");

            borrowedAssetsValue += borrowAssetPrice * borrowAmount / assetUnit(borrowAsset);
        }

        uint256 collateralAssetPrice = priceOracle.getAssetPrice(_collateralUnderlyingAddress);

        collateralValue_ = assetUnit(IERC20(_collateralUnderlyingAddress)) * borrowedAssetsValue / collateralAssetPrice;
        assertGt(collateralValue_, 0, "Invalid collateral value");

        return collateralValue_;
    }

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
            _valueInterpreter: IValueInterpreter(address(getValueInterpreterAddressForVersion(version))),
            _underlyings: _underlyingAddresses,
            _lendingPool: address(lendingPool)
        });
    }

    function __dealATokenAndAddCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase tokens balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
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
                    _to: vaultProxyAddress,
                    _amount: _amounts[i]
                });
            } else {
                increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
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
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
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

    function test_addCollateral_successAsATokens() public {
        address[] memory underlyings = collateralUnderlyingAddresses;

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

    function test_addCollateral_successFromUnderlying() public {
        address[] memory underlyings = collateralUnderlyingAddresses;

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

    function test_addCollateral_failsNotSupportedAssetAddCollateral() public {
        // error will have no message as unsupported asset has no UNDERLYING_ASSET_ADDRESS method
        vm.expectRevert();

        __addCollateral({_aTokens: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1), _fromUnderlying: false});
    }
}

abstract contract RemoveCollateralTest is TestBase {
    function __test_removeCollateral_success(bool _toUnderlying) internal {
        address[] memory aTokens = __getATokensAddresses(collateralUnderlyingAddresses);
        assertGt(aTokens.length, 2, "Not enough aTokens");

        uint256[] memory amountsToAdd = new uint256[](aTokens.length);
        for (uint256 i; i < amountsToAdd.length; i++) {
            amountsToAdd[i] = (i * 2 + 2) * assetUnit(IERC20(aTokens[0])); // use always odd amounts, so there is no issue with rounding
        }

        // Do all 3 kinds of removal amount inputs
        uint256[] memory amountsToRemove = new uint256[](aTokens.length);
        for (uint256 i; i < amountsToRemove.length; i++) {
            if (i == 0) {
                // 1. Manual full amount
                amountsToRemove[i] = amountsToAdd[i];
            } else if (i == 1) {
                // 2. Wildcard full amount
                amountsToRemove[i] = type(uint256).max;
            } else {
                // 3. Partial amount
                amountsToRemove[i] = amountsToAdd[i] / (i + 4);
            }
            assertGt(amountsToRemove[i], 0, "Invalid removal amount");
        }

        __dealATokenAndAddCollateral({_aTokens: aTokens, _amounts: amountsToAdd});

        (, uint256[] memory uniqueAmountsToAdd) =
            aggregateAssetAmounts({_rawAssets: aTokens, _rawAmounts: amountsToAdd, _ceilingAtMax: false});

        (address[] memory uniqueATokensToRemove, uint256[] memory uniqueAmountsToRemove) =
            aggregateAssetAmounts({_rawAssets: aTokens, _rawAmounts: amountsToRemove, _ceilingAtMax: true});

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // expect emit remove collateral event for every fully-removed token
            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                expectEmit(address(aaveV3DebtPosition));
                emit CollateralAssetRemoved(uniqueATokensToRemove[i]);
            }
        }

        vm.recordLogs();

        __removeCollateral({_aTokens: aTokens, _amounts: amountsToRemove, _toUnderlying: _toUnderlying});

        address[] memory assetsToReceive = new address[](aTokens.length);
        for (uint256 i; i < assetsToReceive.length; i++) {
            assetsToReceive[i] = _toUnderlying ? IAaveAToken(aTokens[i]).UNDERLYING_ASSET_ADDRESS() : aTokens[i];
        }
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
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
                removedAsset.balanceOf(vaultProxyAddress),
                expectedVaultBalance,
                1,
                "Vault did not receive removed collateral"
            );
        }
    }

    function test_removeCollateral_successAsATokens() public {
        __test_removeCollateral_success({_toUnderlying: true});
    }

    function test_removeCollateral_successToUnderlyings() public {
        __test_removeCollateral_success({_toUnderlying: false});
    }

    function test_removeCollateral_failsInvalidCollateralAsset() public {
        vm.expectRevert(formatError("__removeCollateralAssets: Invalid collateral asset"));

        __removeCollateral({
            _aTokens: toArray(makeAddr("InvalidCollateralAsset")),
            _amounts: toArray(1),
            _toUnderlying: false
        });
    }
}

abstract contract BorrowTest is TestBase {
    function test_borrow_success() public {
        address underlyingCollateral = collateralUnderlyingAddresses[0];
        address[] memory underlyingsToBorrow = borrowableUnderlyingAddresses;

        // Define arbitrary amounts to borrow
        uint256[] memory underlyingsToBorrowAmounts = new uint256[](underlyingsToBorrow.length);
        for (uint256 i; i < underlyingsToBorrow.length; i++) {
            uint256 borrowAmount = assetUnit(IERC20(underlyingsToBorrow[i])) * (i + 3);
            assertGt(borrowAmount, 0, "Invalid borrow amount");

            underlyingsToBorrowAmounts[i] = borrowAmount;
        }

        // Calculate the collateral to add using a safe buffer (3x borrowed assets value)
        uint256 underlyingCollateralAmount = 3
            * __calcCollateralValueOfBorrowedAssets({
                _borrowedAssetAddresses: underlyingsToBorrow,
                _borrowedAssetAmounts: underlyingsToBorrowAmounts,
                _collateralUnderlyingAddress: underlyingCollateral
            });

        __dealATokenAndAddCollateral({
            _aTokens: toArray(__getATokenAddress(underlyingCollateral)),
            _amounts: toArray(underlyingCollateralAmount)
        });

        (address[] memory uniqueUnderlyingsToBorrow, uint256[] memory uniqueUnderlyingsToBorrowAmounts) =
        aggregateAssetAmounts({
            _rawAssets: underlyingsToBorrow,
            _rawAmounts: underlyingsToBorrowAmounts,
            _ceilingAtMax: false
        });

        // expect the correct event for every unique borrowed token
        for (uint256 i = 0; i < uniqueUnderlyingsToBorrow.length; i++) {
            expectEmit(address(aaveV3DebtPosition));
            emit BorrowedAssetAdded(uniqueUnderlyingsToBorrow[i]);
        }

        vm.recordLogs();

        __borrowAssets({_underlyings: underlyingsToBorrow, _amounts: underlyingsToBorrowAmounts});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: underlyingsToBorrow
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
                IERC20(uniqueUnderlyingsToBorrow[i]).balanceOf(vaultProxyAddress),
                uniqueUnderlyingsToBorrowAmounts[i],
                "Borrowed asset amount was not sent to the vault"
            );
        }
    }
}

abstract contract RepayBorrowTest is TestBase {
    function test_repayBorrow_success() public {
        address underlyingCollateral = collateralUnderlyingAddresses[0];
        address[] memory underlyingsToBorrowAndRepay = borrowableUnderlyingAddresses;

        // Define arbitrary amounts to seed vault, borrow, and repay
        uint256[] memory underlyingsToBorrowAmounts = new uint256[](underlyingsToBorrowAndRepay.length);
        uint256[] memory underlyingsVaultAmounts = new uint256[](underlyingsToBorrowAndRepay.length);
        uint256[] memory underlyingsToRepayAmounts = new uint256[](underlyingsToBorrowAndRepay.length);
        for (uint256 i; i < underlyingsToBorrowAndRepay.length; i++) {
            // Borrow amount
            uint256 borrowAmount = assetUnit(IERC20(underlyingsToBorrowAndRepay[i])) * (i + 3);
            assertGt(borrowAmount, 0, "Invalid borrow amount");

            underlyingsToBorrowAmounts[i] = borrowAmount;

            // Repay input amount
            if (i == 0) {
                underlyingsToRepayAmounts[i] = type(uint256).max;
            } else {
                underlyingsToRepayAmounts[i] = borrowAmount / (i + 5);
            }

            // Pre-repay vault balance
            // Must be greater than repay amounts, so just use multiple of borrow amounts
            underlyingsVaultAmounts[i] = borrowAmount * (i + 3);
        }

        // Calculate the collateral to add using a safe buffer (3x borrowed assets value)
        uint256 underlyingCollateralAmount = 3
            * __calcCollateralValueOfBorrowedAssets({
                _borrowedAssetAddresses: underlyingsToBorrowAndRepay,
                _borrowedAssetAmounts: underlyingsToBorrowAmounts,
                _collateralUnderlyingAddress: underlyingCollateral
            });

        __dealATokenAndAddCollateral({
            _aTokens: toArray(__getATokenAddress(underlyingCollateral)),
            _amounts: toArray(underlyingCollateralAmount)
        });

        __borrowAssets({_underlyings: underlyingsToBorrowAndRepay, _amounts: underlyingsToBorrowAmounts});

        for (uint256 i = 0; i < underlyingsToBorrowAndRepay.length; i++) {
            // set vault balances with amounts
            deal({token: underlyingsToBorrowAndRepay[i], give: underlyingsVaultAmounts[i], to: vaultProxyAddress});
        }

        // expect emit borrowed asset removed event for every fully-repaid token
        for (uint256 i = 0; i < underlyingsToBorrowAndRepay.length; i++) {
            if (underlyingsToBorrowAmounts[i] <= underlyingsToRepayAmounts[i]) {
                expectEmit(address(aaveV3DebtPosition));
                emit BorrowedAssetRemoved(underlyingsToBorrowAndRepay[i]);
            }
        }

        vm.recordLogs();

        __repayBorrowedAssets({_underlyings: underlyingsToBorrowAndRepay, _amounts: underlyingsToRepayAmounts});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        for (uint256 i = 0; i < underlyingsToBorrowAndRepay.length; i++) {
            // check the vault balance is correct after repay
            // if the repay amount is greater than the borrowed amount the vault balance should be decreased by the borrowed amount
            // if the repay amount is less than the borrowed amount the vault balance should be decreased by the repay amount
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(
                IERC20(underlyingsToBorrowAndRepay[i]).balanceOf(vaultProxyAddress),
                underlyingsVaultAmounts[i] - Math.min(underlyingsToBorrowAmounts[i], underlyingsToRepayAmounts[i]),
                1,
                "Vault balance is not correct after repay"
            );

            if (underlyingsToRepayAmounts[i] >= underlyingsToBorrowAmounts[i]) {
                // check that the EP no longer considers fully-repaid tokens as borrowed
                assertFalse(
                    aaveV3DebtPosition.assetIsBorrowed(underlyingsToBorrowAndRepay[i]), "Asset is still borrowed"
                );
            } else {
                // check that the debt decreased
                // 1 wei difference is allowed because of the interest accrued if the colletaral is supplied is the same as borrowed asset
                assertApproxEqAbs(
                    IERC20(aaveV3DebtPosition.getDebtTokenForBorrowedAsset(underlyingsToBorrowAndRepay[i])).balanceOf(
                        address(aaveV3DebtPosition)
                    ),
                    underlyingsToBorrowAmounts[i] - underlyingsToRepayAmounts[i],
                    1,
                    "Invalid debt amount"
                );
                // check that the EP has still not fully-repaid tokens as borrowed
                assertTrue(aaveV3DebtPosition.assetIsBorrowed(underlyingsToBorrowAndRepay[i]), "Asset is not borrowed");
            }
        }
    }

    function test_repayBorrow_failsRepayTokenNotBorrowed() public {
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
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // verify that the category id is set for external position
        assertEq(lendingPool.getUserEMode(address(aaveV3DebtPosition)), categoryId, "Invalid category id");
    }
}

abstract contract SetUseReserveAsCollateral is TestBase {
    function test_setUseReserveAsCollateral_success() public {
        address underlyingAddress = collateralUnderlyingAddresses[0];

        // get reserve data about underlying
        IAaveV3Pool.ReserveData memory reserveData = lendingPool.getReserveData(underlyingAddress);

        // get user configuration before enabling underlying as collateral
        IAaveV3Pool.UserConfigurationMap memory userConfigurationMapBefore =
            lendingPool.getUserConfiguration(address(aaveV3DebtPosition));

        // check that the underlying is NOT enabled as collateral
        assertFalse(
            __isUsingAsCollateral({_userConfigurationMap: userConfigurationMapBefore, _reserveIndex: reserveData.id}),
            "Underlying is enabled as collateral"
        );

        // add as colletaral minimum 1 wei to be able to enable underlying as collateral
        __dealATokenAndAddCollateral({_aTokens: toArray(__getATokenAddress(underlyingAddress)), _amounts: toArray(1)});

        vm.recordLogs();

        // enable underlying as collateral
        __setUseReserveAsCollateral({_underlying: underlyingAddress, _useAsCollateral: true});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
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

contract MockedTransferStrategy {
    function performTransfer(address _to, address _reward, uint256 _amount) external returns (bool success_) {
        return IERC20(_reward).transfer(_to, _amount);
    }
}

abstract contract ClaimRewardsTest is TestBase {
    function test_claimRewards_success() public {
        address collateralATokenAddress = __getATokenAddress(rewardedCollateralUnderlyingAddress);

        __dealATokenAndAddCollateral({
            _aTokens: toArray(collateralATokenAddress),
            _amounts: toArray(1 * assetUnit(IERC20(collateralATokenAddress)))
        });

        // set up reward token distribution
        address rewardToken = rewardsController.getRewardsByAsset(collateralATokenAddress)[0];

        address mockedTransferStrategy = address(new MockedTransferStrategy());

        // increase reward token balance of the strategy, so it can pay rewards
        increaseTokenBalance({
            _token: IERC20(rewardToken),
            _to: mockedTransferStrategy,
            _amount: 1_000_000 * assetUnit(IERC20(rewardToken))
        });

        address emissionManager = rewardsController.getEmissionManager();

        vm.startPrank(emissionManager);
        rewardsController.setTransferStrategy({_rewardToken: rewardToken, _transferStrategy: mockedTransferStrategy});
        rewardsController.setDistributionEnd({
            _rewardToken: rewardToken,
            _newDistributionEnd: uint32(block.timestamp + 30 days),
            _asset: collateralATokenAddress
        });
        uint88[] memory newEmissionsPerSecond = new uint88[](1);
        newEmissionsPerSecond[0] = 1 ether / 100_000;
        rewardsController.setEmissionPerSecond({
            _asset: collateralATokenAddress,
            _rewards: toArray(rewardToken),
            _newEmissionsPerSecond: newEmissionsPerSecond
        });
        vm.stopPrank();

        // wait some time to accrue rewards
        skip(14 days);

        uint256 preClaimRewardBalance = IERC20(rewardToken).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimRewards({
            _assets: toArray(collateralATokenAddress),
            _amount: type(uint256).max,
            _rewardToken: rewardToken
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(rewardToken)
        });

        uint256 postClaimRewardBalance = IERC20(rewardToken).balanceOf(vaultProxyAddress);

        assertGt(postClaimRewardBalance, preClaimRewardBalance, "Reward was not claimed");
    }
}

abstract contract SweepTest is TestBase {
    function test_sweep_success() public {
        address[] memory assetToSweep = toArray(address(createTestToken("Asset1")), address(createTestToken("Asset2")));
        uint256[] memory amountsToSweep = new uint256[](assetToSweep.length);

        // deal some assets to sweep to the external position
        for (uint256 i = 0; i < assetToSweep.length; i++) {
            amountsToSweep[i] = (i + 1) * assetUnit(IERC20(assetToSweep[i]));
            increaseTokenBalance({
                _token: IERC20(assetToSweep[i]),
                _to: address(aaveV3DebtPosition),
                _amount: amountsToSweep[i]
            });
        }

        vm.recordLogs();

        __sweep(assetToSweep);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        for (uint256 i = 0; i < assetToSweep.length; i++) {
            assertEq(IERC20(assetToSweep[i]).balanceOf(address(aaveV3DebtPosition)), 0, "Asset was not swept");
        }

        for (uint256 i = 0; i < assetToSweep.length; i++) {
            assertEq(
                IERC20(assetToSweep[i]).balanceOf(vaultProxyAddress),
                amountsToSweep[i],
                "Asset was not swept to the vault"
            );
        }
    }

    function test_sweep_failsWithCollateralAsset() public {
        address collateralATokenAddress = __getATokenAddress(rewardedCollateralUnderlyingAddress);

        __dealATokenAndAddCollateral({
            _aTokens: toArray(collateralATokenAddress),
            _amounts: toArray(1 * assetUnit(IERC20(collateralATokenAddress)))
        });

        vm.expectRevert(formatError("__sweep: Invalid asset, is collateral"));
        __sweep(toArray(collateralATokenAddress));
    }
}

abstract contract ClaimMerklRewardsTest is TestBase {
    function test_claimMerklRewards_success() public {
        address tokenToClaim = address(createTestToken("Asset1"));

        uint256 totalAmountRewardedInTheFirstRound = 333;

        __test_claimMerklRewards_success({
            _tokenToClaim: tokenToClaim,
            _totalAmountRewarded: totalAmountRewardedInTheFirstRound
        });

        __test_claimMerklRewards_success({
            _tokenToClaim: tokenToClaim,
            _totalAmountRewarded: totalAmountRewardedInTheFirstRound + 244
        });
    }

    function __test_claimMerklRewards_success(address _tokenToClaim, uint256 _totalAmountRewarded) internal {
        uint256 amountToClaim =
            _totalAmountRewarded - merklDistributor.claimed(address(aaveV3DebtPosition), _tokenToClaim);

        bytes32[] memory nodes = new bytes32[](2);
        nodes[0] = keccak256(abi.encode(address(aaveV3DebtPosition), _tokenToClaim, _totalAmountRewarded));
        nodes[1] = keccak256(abi.encode(makeAddr("random user 1"), makeAddr("random token 1"), 100));

        // set up reward token distribution
        // ordering of nodes matters, it should be from the smallest to the largest
        bytes32 merkleRoot =
            keccak256(nodes[0] < nodes[1] ? abi.encode(nodes[0], nodes[1]) : abi.encode(nodes[1], nodes[0]));

        // mock call is used to bypass governor check instead of vm.prank, because there is no easy way to get the governor address, as it is stored in the mapping
        vm.mockCall({
            callee: merklDistributor.core(),
            data: abi.encodeWithSelector(IMerklCore.isGovernor.selector),
            returnData: abi.encode(true)
        });
        // call updateTree twice so we don't have to worry about the dispute period
        // normally two merkleRoots are stored, old one is used until dispute period elapsed
        // alternatively, we could use the governor to skip the dispute period, but it is not necessary for this test
        merklDistributor.updateTree(IMerklDistributor.MerkleTree({merkleRoot: merkleRoot, ipfsHash: ""}));
        merklDistributor.updateTree(IMerklDistributor.MerkleTree({merkleRoot: merkleRoot, ipfsHash: ""}));
        // clear mocks so we are sure it won't interfere with the test
        vm.clearMockedCalls();

        increaseTokenBalance({_token: IERC20(_tokenToClaim), _to: address(merklDistributor), _amount: amountToClaim});

        // get merkle proof
        bytes32[] memory merkleProof = new bytes32[](1);
        merkleProof[0] = nodes[1];

        bytes32[][] memory merkleProofs = new bytes32[][](1);
        merkleProofs[0] = merkleProof;

        uint256 preClaimRewardBalance = IERC20(_tokenToClaim).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimMerklRewards({_tokens: toArray(_tokenToClaim), _amounts: toArray(amountToClaim), _proofs: merkleProofs});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(_tokenToClaim)
        });

        assertEq(
            IERC20(_tokenToClaim).balanceOf(vaultProxyAddress),
            preClaimRewardBalance + amountToClaim,
            "Asset was not claimed"
        );
    }

    function test_claimMerklRewards_failsWithDuplicateToken() public {
        address tokenToClaim = address(createTestToken("Asset1"));
        address[] memory tokensToClaim = toArray(tokenToClaim, tokenToClaim);

        vm.expectRevert(formatError("__claimMerklRewards: Duplicate tokens to claim"));

        __claimMerklRewards({_tokens: tokensToClaim, _amounts: new uint256[](0), _proofs: new bytes32[][](0)});
    }
}

// Normally in this place there would be tests for getManagedAssets, and getDebtAssets, but in Aave's case it is very straightforward, i.e., there is only one kind of managed asset with one way of calculating it, and same for debt assets.
// Therefore, we don't need to test it.

abstract contract AaveV3DebtPositionTestBase is
    SetUseReserveAsCollateral,
    SetEModeTest,
    RepayBorrowTest,
    BorrowTest,
    AddCollateralTest,
    RemoveCollateralTest,
    ClaimRewardsTest,
    SweepTest,
    ClaimMerklRewardsTest
{}
