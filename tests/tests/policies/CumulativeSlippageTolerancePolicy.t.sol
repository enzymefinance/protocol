// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {MockedAdapter} from "tests/utils/core/AdapterUtils.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";
import {CumulativeSlippageTolerancePolicyUtils} from "tests/utils/policies/CumulativeSlippageTolerancePolicyUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {ICumulativeSlippageTolerancePolicy} from "tests/interfaces/internal/ICumulativeSlippageTolerancePolicy.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

contract CumulativeSlippageTolerancePolicyTest is IntegrationTest, CumulativeSlippageTolerancePolicyUtils {
    uint256 private constant ONE_HUNDRED_PERCENT_FOR_POLICY = 1 ether; // 10 ** 18
    bytes private constant ERROR_MESSAGE_FOR_POLICY = "Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE";
    // keccak256(abi.encodePacked("mln.vaultCall.any")
    bytes32 private constant ANY_VAULT_CALL = 0x5bf1898dd28c4d29f33c4c1bb9b8a7e2f6322847d70be63e8f89de024d08a669;

    address internal sharesBuyer = makeAddr("SharesBuyer");

    address internal vaultOwner;
    IVaultLib internal vaultProxy;
    IComptrollerLib internal comptrollerProxy;
    ICumulativeSlippageTolerancePolicy internal cumulativeSlippageTolerancePolicy;
    MockedAdapter internal mockedAdapter;
    IERC20 internal fakeToken0;
    IERC20 internal fakeToken1;
    uint256 internal vaultInitialBalance = 1 ether;
    TestChainlinkAggregator internal fakeToken0Aggregator;
    TestChainlinkAggregator internal fakeToken1Aggregator;

    function setUp() public override {
        super.setUp();

        mockedAdapter = deployMockedAdapter();

        fakeToken0 = createTestToken(18, "Fake Token 0", "FK0");

        fakeToken0Aggregator = addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(fakeToken0),
            _skipIfRegistered: false
        });

        fakeToken1 = createTestToken(18, "Fake Token 1", "FK1");

        fakeToken1Aggregator = addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(fakeToken1),
            _skipIfRegistered: false
        });
    }

    function createVaultWithPolicy(
        uint64 _tolerance,
        uint256 _pricelessAssetBypassTimelock,
        uint256 _pricelessAssetBypassTimeLimit,
        uint256 _tolerancePeriodDuration,
        address[] memory _bypassableAdaptersListItems
    ) internal {
        // TODO: Create address list utils.
        uint256 bypassableAdaptersListId = core.persistent.addressListRegistry.createList({
            _owner: vaultOwner,
            _initialItems: _bypassableAdaptersListItems,
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove)
        });

        cumulativeSlippageTolerancePolicy = deployCumulativeSlippageTolerancePolicy({
            _wethToken: wethToken,
            _policyManager: core.release.policyManager,
            _addressListRegistry: core.persistent.addressListRegistry,
            _valueInterpreter: core.release.valueInterpreter,
            _bypassableAdaptersListId: bypassableAdaptersListId,
            _tolerancePeriodDuration: _tolerancePeriodDuration,
            _pricelessAssetBypassTimelock: _pricelessAssetBypassTimelock,
            _pricelessAssetBypassTimeLimit: _pricelessAssetBypassTimeLimit
        });

        // Create fund with policy and integration extensions
        IComptrollerLib.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(fakeToken0);
        comptrollerConfig.policyManagerConfigData = encodePolicyManagerConfigData({
            _policies: toArray(address(cumulativeSlippageTolerancePolicy)),
            _settingsData: toArray(encodeCumulativeSlippageTolerancePolicySettings({_tolerance: _tolerance}))
        });
        comptrollerConfig.extensionsConfig = new IComptrollerLib.ExtensionConfigInput[](1);
        comptrollerConfig.extensionsConfig[0].extension = address(core.release.integrationManager);

        (comptrollerProxy, vaultProxy, vaultOwner) = createFund({
            _fundDeployer: core.release.fundDeployer,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(comptrollerConfig)
        });

        buyShares({
            _comptrollerProxy: comptrollerProxy,
            _sharesBuyer: sharesBuyer,
            _amountToDeposit: vaultInitialBalance
        });
    }

    function test_ConsecutiveCalls(uint64 _tolerance, uint256 _spendAssetAmount, uint256 _callsNumber) public {
        _callsNumber = bound(_callsNumber, 1, 10);
        _spendAssetAmount = bound(_spendAssetAmount, _callsNumber, (vaultInitialBalance / _callsNumber));
        _tolerance =
            uint64(bound(_tolerance, ONE_HUNDRED_PERCENT_FOR_POLICY / 1000, ONE_HUNDRED_PERCENT_FOR_POLICY - 1)); // 0.1% - 99.99...%

        createVaultWithPolicy({
            _tolerance: _tolerance,
            _tolerancePeriodDuration: 1 days,
            _pricelessAssetBypassTimelock: 0,
            _pricelessAssetBypassTimeLimit: 0,
            _bypassableAdaptersListItems: new address[](0)
        });

        uint256 minIncomingAssetAmount = amountWithSlippage(_spendAssetAmount, _tolerance / _callsNumber) + 1;

        bytes memory callArgs = getEncodedAdapterCallArgs({
            _spendAssetAmount: _spendAssetAmount,
            _minIncomingAssetAmount: minIncomingAssetAmount
        });

        for (uint256 i = 0; i < _callsNumber; ++i) {
            callOnIntegration({
                _integrationManager: core.release.integrationManager,
                _comptrollerProxy: comptrollerProxy,
                _caller: vaultOwner,
                _callArgs: callArgs
            });
        }
    }

    function test_RevertLastCallConsecutiveCalls(uint64 _tolerance, uint256 _spendAssetAmount, uint256 _callsNumber)
        public
    {
        _callsNumber = bound(_callsNumber, 1, 10);
        _spendAssetAmount = bound(_spendAssetAmount, 10000 * _callsNumber, (vaultInitialBalance / _callsNumber));
        _tolerance =
            uint64(bound(_tolerance, ONE_HUNDRED_PERCENT_FOR_POLICY / 1000, ONE_HUNDRED_PERCENT_FOR_POLICY - 1)); // 0.1% - 99.99...%

        createVaultWithPolicy({
            _tolerance: _tolerance,
            _tolerancePeriodDuration: 1 days,
            _pricelessAssetBypassTimelock: 0,
            _pricelessAssetBypassTimeLimit: 0,
            _bypassableAdaptersListItems: new address[](0)
        });

        uint256 minIncomingAssetAmount = amountWithSlippage(_spendAssetAmount, _tolerance / _callsNumber);

        bytes memory callArgs = getEncodedAdapterCallArgs({
            _spendAssetAmount: _spendAssetAmount,
            _minIncomingAssetAmount: minIncomingAssetAmount
        });

        for (uint256 i = 0; i < _callsNumber - 1; ++i) {
            callOnIntegration({
                _integrationManager: core.release.integrationManager,
                _comptrollerProxy: comptrollerProxy,
                _caller: vaultOwner,
                _callArgs: callArgs
            });
        }

        bytes memory lastCallArgs = getEncodedAdapterCallArgs({
            _spendAssetAmount: _spendAssetAmount,
            _minIncomingAssetAmount: minIncomingAssetAmount - 1
        });

        vm.expectRevert(ERROR_MESSAGE_FOR_POLICY);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: lastCallArgs
        });
    }

    function test_CallsTolerancePeriod(
        uint256 _tolerancePeriodDuration,
        uint64 _tolerance,
        uint256 _spendAssetAmount,
        uint256 _callsNumber
    ) public {
        _callsNumber = bound(_callsNumber, 1, 10);
        _spendAssetAmount = bound(_spendAssetAmount, _callsNumber, (vaultInitialBalance / (_callsNumber + 1)));
        _tolerance =
            uint64(bound(_tolerance, ONE_HUNDRED_PERCENT_FOR_POLICY / 1000, ONE_HUNDRED_PERCENT_FOR_POLICY - 1)); // 0.1% - 99.99...%
        _tolerancePeriodDuration = bound(_tolerancePeriodDuration, _callsNumber * 10000, (52 weeks) * 3);

        createVaultWithPolicy({
            _tolerance: _tolerance,
            _tolerancePeriodDuration: _tolerancePeriodDuration,
            _pricelessAssetBypassTimelock: 0,
            _pricelessAssetBypassTimeLimit: 0,
            _bypassableAdaptersListItems: new address[](0)
        });

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: getEncodedAdapterCallArgs({
                _spendAssetAmount: _spendAssetAmount,
                _minIncomingAssetAmount: amountWithSlippage(_spendAssetAmount, _tolerance) + 1
            })
        });

        uint256 minIncomingAssetAmount = amountWithSlippage(_spendAssetAmount, _tolerance / _callsNumber) + 1;

        for (uint256 i = 0; i < _callsNumber; ++i) {
            skip((_tolerancePeriodDuration / _callsNumber) + 1);

            callOnIntegration({
                _integrationManager: core.release.integrationManager,
                _comptrollerProxy: comptrollerProxy,
                _caller: vaultOwner,
                _callArgs: getEncodedAdapterCallArgs({
                    _spendAssetAmount: _spendAssetAmount,
                    _minIncomingAssetAmount: minIncomingAssetAmount
                })
            });
        }
    }

    function test_RevertLastCallCallsTolerancePeriod(
        uint256 _tolerancePeriodDuration,
        uint64 _tolerance,
        uint256 _spendAssetAmount,
        uint256 _callsNumber
    ) public {
        _callsNumber = bound(_callsNumber, 1, 10);
        _spendAssetAmount = bound(_spendAssetAmount, _callsNumber * 100, (vaultInitialBalance / (_callsNumber + 1)));
        _tolerance =
            uint64(bound(_tolerance, ONE_HUNDRED_PERCENT_FOR_POLICY / 1000, ONE_HUNDRED_PERCENT_FOR_POLICY - 1)); // 0.1% - 99.99...%
        _tolerancePeriodDuration = bound(_tolerancePeriodDuration, _callsNumber * 10000, (52 weeks) * 3);

        createVaultWithPolicy({
            _tolerance: _tolerance,
            _tolerancePeriodDuration: _tolerancePeriodDuration,
            _pricelessAssetBypassTimelock: 0,
            _pricelessAssetBypassTimeLimit: 0,
            _bypassableAdaptersListItems: new address[](0)
        });

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: getEncodedAdapterCallArgs({
                _spendAssetAmount: _spendAssetAmount,
                _minIncomingAssetAmount: amountWithSlippage(_spendAssetAmount, _tolerance) + 1
            })
        });

        uint256 minIncomingAssetAmount = amountWithSlippage(_spendAssetAmount, _tolerance / _callsNumber) + 1;

        for (uint256 i = 0; i < _callsNumber - 1; ++i) {
            skip((_tolerancePeriodDuration / _callsNumber) + 1);

            callOnIntegration({
                _integrationManager: core.release.integrationManager,
                _comptrollerProxy: comptrollerProxy,
                _caller: vaultOwner,
                _callArgs: getEncodedAdapterCallArgs({
                    _spendAssetAmount: _spendAssetAmount,
                    _minIncomingAssetAmount: minIncomingAssetAmount
                })
            });
        }

        skip((_tolerancePeriodDuration / _callsNumber) - _callsNumber - 1);

        uint256 lastCallMinIncomingAssetAmount;

        if (_callsNumber == 1) {
            lastCallMinIncomingAssetAmount = minIncomingAssetAmount - _callsNumber;
        } else {
            lastCallMinIncomingAssetAmount = minIncomingAssetAmount - _callsNumber - 1;
        }

        bytes memory lastCallArgs = getEncodedAdapterCallArgs({
            _spendAssetAmount: _spendAssetAmount,
            _minIncomingAssetAmount: lastCallMinIncomingAssetAmount
        });

        vm.expectRevert(ERROR_MESSAGE_FOR_POLICY);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: lastCallArgs
        });
    }

    function test_SkipCheckForBypassableAdaptersList() public {
        address[] memory bypassableAdaptersListItems = new address[](1);
        bypassableAdaptersListItems[0] = address(mockedAdapter);

        createVaultWithPolicy({
            _tolerance: uint64((ONE_HUNDRED_PERCENT_FOR_POLICY * 3) / 100), // 3%
            _tolerancePeriodDuration: 1 days,
            _pricelessAssetBypassTimelock: 0,
            _pricelessAssetBypassTimeLimit: 0,
            _bypassableAdaptersListItems: bypassableAdaptersListItems
        });

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: getEncodedAdapterCallArgs({
                _spendAssetAmount: vaultInitialBalance,
                _minIncomingAssetAmount: amountWithSlippage(vaultInitialBalance, (4 * ONE_HUNDRED_PERCENT_FOR_POLICY) / 100) // 4%
            })
        });
    }

    function test_PricelessAssetsInNotTakenIntoAccount() public {
        createVaultWithPolicy({
            _tolerance: uint64((ONE_HUNDRED_PERCENT_FOR_POLICY * 3) / 100), // 3%
            _tolerancePeriodDuration: 1 days,
            _pricelessAssetBypassTimelock: 0, // start immediately
            _pricelessAssetBypassTimeLimit: 1 days,
            _bypassableAdaptersListItems: new address[](0)
        });

        fakeToken0Aggregator.setPrice(0);
        registerVaultCallStartAssetBypassTimelock();

        vm.prank(vaultOwner);

        comptrollerProxy.vaultCallOnContract({
            _contract: address(cumulativeSlippageTolerancePolicy),
            _selector: ICumulativeSlippageTolerancePolicy.startAssetBypassTimelock.selector,
            _encodedArgs: abi.encode(fakeToken0)
        });

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: getEncodedAdapterCallArgs({
                _spendAssetAmount: vaultInitialBalance,
                _minIncomingAssetAmount: amountWithSlippage(vaultInitialBalance, (4 * ONE_HUNDRED_PERCENT_FOR_POLICY) / 100) // 4%
            })
        });
    }

    function test_RevertPricelessAssetsOutNotTakenIntoAccount() public {
        createVaultWithPolicy({
            _tolerance: uint64((ONE_HUNDRED_PERCENT_FOR_POLICY * 3) / 100), // 3%
            _tolerancePeriodDuration: 1 days,
            _pricelessAssetBypassTimelock: 0, // start immediately
            _pricelessAssetBypassTimeLimit: 1 days,
            _bypassableAdaptersListItems: new address[](0)
        });

        fakeToken1Aggregator.setPrice(0);

        registerVaultCallStartAssetBypassTimelock();

        vm.prank(vaultOwner);

        comptrollerProxy.vaultCallOnContract({
            _contract: address(cumulativeSlippageTolerancePolicy),
            _selector: ICumulativeSlippageTolerancePolicy.startAssetBypassTimelock.selector,
            _encodedArgs: abi.encode(fakeToken1)
        });

        bytes memory callArgs = getEncodedAdapterCallArgs({
            _spendAssetAmount: vaultInitialBalance,
            _minIncomingAssetAmount: amountWithSlippage(vaultInitialBalance, (1 * ONE_HUNDRED_PERCENT_FOR_POLICY) / 100) // 1%
        });

        vm.expectRevert(ERROR_MESSAGE_FOR_POLICY);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: callArgs
        });
    }

    function registerVaultCallStartAssetBypassTimelock() internal {
        address[] memory contracts = new address[](1);
        contracts[0] = address(cumulativeSlippageTolerancePolicy);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = ICumulativeSlippageTolerancePolicy.startAssetBypassTimelock.selector;

        bytes32[] memory dataHashes = new bytes32[](1);
        dataHashes[0] = ANY_VAULT_CALL;

        registerVaultCalls({
            _fundDeployer: core.release.fundDeployer,
            _contracts: contracts,
            _selectors: selectors,
            _dataHashes: dataHashes
        });
    }

    function amountWithSlippage(uint256 _amount, uint256 _slippage) internal pure returns (uint256) {
        return (_amount * (ONE_HUNDRED_PERCENT_FOR_POLICY - _slippage)) / ONE_HUNDRED_PERCENT_FOR_POLICY;
    }

    function getEncodedAdapterCallArgs(uint256 _spendAssetAmount, uint256 _minIncomingAssetAmount)
        internal
        view
        returns (bytes memory)
    {
        address[] memory spendAssets = new address[](1);
        spendAssets[0] = address(fakeToken0);

        address[] memory incomingAssets = new address[](1);
        incomingAssets[0] = address(fakeToken1);

        uint256[] memory spendAssetAmounts = new uint256[](1);
        spendAssetAmounts[0] = _spendAssetAmount;

        uint256[] memory minIncomingAssetAmounts = new uint256[](1);
        minIncomingAssetAmounts[0] = _minIncomingAssetAmount;

        bytes memory integrationData = mockedAdapter.encodeAssetsForAction({
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: spendAssets,
            _spendAssetAmounts: spendAssetAmounts,
            _incomingAssets: incomingAssets,
            _minIncomingAssetAmounts: minIncomingAssetAmounts
        });

        return abi.encode(address(mockedAdapter), MockedAdapter.action.selector, integrationData);
    }
}
