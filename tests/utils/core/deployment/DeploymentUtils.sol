// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {Contracts as PersistentContracts} from "tests/utils/core/deployment/PersistentContracts.sol";
import {Contracts as ReleaseContracts} from "tests/utils/core/deployment/V5ReleaseContracts.sol";

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IFundValueCalculatorRouter} from "tests/interfaces/internal/IFundValueCalculatorRouter.sol";
import {IFundValueCalculator} from "tests/interfaces/internal/IFundValueCalculator.sol";
import {IGasRelayPaymasterFactory} from "tests/interfaces/internal/IGasRelayPaymasterFactory.sol";
import {IGlobalConfigLib} from "tests/interfaces/internal/IGlobalConfigLib.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IProtocolFeeReserveLib} from "tests/interfaces/internal/IProtocolFeeReserveLib.sol";
import {IProtocolFeeTracker} from "tests/interfaces/internal/IProtocolFeeTracker.sol";
import {IUintListRegistry} from "tests/interfaces/internal/IUintListRegistry.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

// This is required because we run into a stack-too-deep error otherwise
// TODO: check whether this is still the case
struct DeployComptrollerLibParams {
    IDispatcher dispatcher;
    IProtocolFeeReserveLib protocolFeeReserveProxy;
    IFundDeployer fundDeployer;
    IValueInterpreter valueInterpreter;
    IFeeManager feeManager;
    IPolicyManager policyManager;
    address mlnTokenAddress;
    address wrappedNativeTokenAddress;
}

struct ReleaseConfig {
    // Chainlink
    address chainlinkEthUsdAggregatorAddress;
    uint256 chainlinkStaleRateThreshold;
    // Tokens
    address mlnTokenAddress;
    address wethTokenAddress;
    address wrappedNativeTokenAddress;
    // Gas relayer
    uint256 gasRelayDepositCooldown;
    uint256 gasRelayDepositMaxTotal;
    uint256 gasRelayFeeMaxPercent;
    address gasRelayHubAddress;
    uint256 gasRelayRelayFeeMaxBase;
    address gasRelayTrustedForwarderAddress;
    // Vault settings
    address vaultMlnBurner;
    uint256 vaultPositionsLimit;
}

abstract contract DeploymentUtils is CoreUtilsBase {
    // Persistent pipeline

    /// @dev Define vars per contract rather than assigning directly to releaseContracts_,
    /// as this will enforce dependency ordering with no accidental uses of address(0),
    /// e.g., if PersistentContracts_.dispatcher were used before it is assigned to.
    function deployPersistentCore() internal returns (PersistentContracts memory) {
        // Deploy all release contracts from a non-test contract
        address deployer = makeAddr("deployPersistentCore: Deployer");
        vm.startPrank(deployer);

        IDispatcher dispatcher = deployDispatcher();

        IAddressListRegistry addressListRegistry = deployAddressListRegistry({_dispatcher: dispatcher});
        IExternalPositionFactory externalPositionFactory = deployExternalPositionFactory({_dispatcher: dispatcher});
        // GlobalConfigLib depends on knowing the v4 FundDeployer address, so must be upgraded after deploying the release core.
        // For now, we set _fundDeployerV4Address as empty to deploy a valid proxy.
        IGlobalConfigLib globalConfigProxy = deployGlobalConfigProxy({
            _dispatcher: dispatcher,
            _globalConfigLibAddress: deployGlobalConfigLib({_fundDeployerV4Address: address(0)})
        });
        IProtocolFeeReserveLib protocolFeeReserveProxy = deployProtocolFeeReserveProxy({
            _dispatcher: dispatcher,
            _protocolFeeReserveLibAddress: deployProtocolFeeReserveLib()
        });
        IUintListRegistry uintListRegistry = deployUintListRegistry({_dispatcher: dispatcher});

        IFundValueCalculatorRouter fundValueCalculatorRouter = deployFundValueCalculatorRouter({
            _dispatcher: dispatcher,
            _fundDeployers: new address[](0),
            _fundValueCalculators: new address[](0)
        });

        vm.stopPrank();

        return PersistentContracts({
            addressListRegistry: addressListRegistry,
            dispatcher: dispatcher,
            externalPositionFactory: externalPositionFactory,
            fundValueCalculatorRouter: fundValueCalculatorRouter,
            globalConfigProxy: globalConfigProxy,
            protocolFeeReserveProxy: protocolFeeReserveProxy,
            uintListRegistry: uintListRegistry
        });
    }

    // Release pipeline - main

    function deployReleaseCore(ReleaseConfig memory _config, PersistentContracts memory _persistentContracts)
        internal
        returns (ReleaseContracts memory releaseContracts_)
    {
        releaseContracts_ =
            deployReleaseCoreContractsOnly({_config: _config, _persistentContracts: _persistentContracts});

        // Post-deployment actions

        // Upgrade GlobalConfigLib with the v4 FundDeployer address
        // called by Dispatcher owner
        address globalConfigLibAddress =
            deployGlobalConfigLib({_fundDeployerV4Address: address(releaseContracts_.fundDeployer)});
        vm.prank(_persistentContracts.dispatcher.getOwner());
        _persistentContracts.globalConfigProxy.setGlobalConfigLib(globalConfigLibAddress);

        // called by Dispatcher owner
        addExternalPositionManagerToFactory({
            _externalPositionFactory: _persistentContracts.externalPositionFactory,
            _externalPositionManager: releaseContracts_.externalPositionManager
        });

        // called by FundDeployer owner
        setFundDeployerPseudoVars({
            _fundDeployer: releaseContracts_.fundDeployer,
            _protocolFeeTracker: releaseContracts_.protocolFeeTracker,
            _comptrollerLibAddress: releaseContracts_.comptrollerLibAddress,
            _vaultLibAddress: releaseContracts_.vaultLibAddress
        });

        // called by Dispatcher owner
        setFundValueCalculatorRouterFundValueCalculators({
            _fundValueCalculatorRouter: _persistentContracts.fundValueCalculatorRouter,
            _fundDeployers: toArray(address(releaseContracts_.fundDeployer)),
            _fundValueCalculators: toArray(address(releaseContracts_.fundValueCalculator))
        });

        // called by FundDeployer owner
        if (_config.chainlinkEthUsdAggregatorAddress != address(0)) {
            setValueInterpreterEthUsdAggregator({
                _valueInterpreter: releaseContracts_.valueInterpreter,
                _ethUsdAggregatorAddress: _config.chainlinkEthUsdAggregatorAddress
            });
        }

        // Final action
        // called by FundDeployer owner
        setReleaseLive({_dispatcher: _persistentContracts.dispatcher, _fundDeployer: releaseContracts_.fundDeployer});
    }

    // TODO: refactor to do this (currently stack-too-deep so we don't do it):
    /// @dev Define vars per contract rather than assigning directly to releaseContracts_,
    /// as this will enforce dependency ordering with no accidental uses of address(0),
    /// e.g., if ReleaseContracts_.fundDeployer were used before it is assigned to.
    function deployReleaseCoreContractsOnly(
        ReleaseConfig memory _config,
        PersistentContracts memory _persistentContracts
    ) internal returns (ReleaseContracts memory releaseContracts_) {
        // Deploy all release contracts from a non-test contract
        address deployer = makeAddr("deployReleaseCoreContractsOnly: Deployer");
        vm.startPrank(deployer);

        {
            address gasRelayPaymasterLibAddress = deployGasRelayPaymasterLib({
                _wrappedNativeTokenAddress: _config.wrappedNativeTokenAddress,
                _gasRelayHubAddress: _config.gasRelayHubAddress,
                _gasRelayTrustedForwarderAddress: _config.gasRelayTrustedForwarderAddress,
                _gasRelayDepositCooldown: _config.gasRelayDepositCooldown,
                _gasRelayDepositMaxTotal: _config.gasRelayDepositMaxTotal,
                _gasRelayRelayFeeMaxBase: _config.gasRelayRelayFeeMaxBase,
                _gasRelayRelayFeeMaxPercent: _config.gasRelayFeeMaxPercent
            });
            releaseContracts_.gasRelayPaymasterFactory = deployGasRelayPaymasterFactory({
                _dispatcher: _persistentContracts.dispatcher,
                _gasRelayPaymasterLibAddress: gasRelayPaymasterLibAddress
            });
        }

        releaseContracts_.fundDeployer = deployFundDeployer({_dispatcher: _persistentContracts.dispatcher});

        releaseContracts_.protocolFeeTracker = deployProtocolFeeTracker({_fundDeployer: releaseContracts_.fundDeployer});
        releaseContracts_.valueInterpreter = deployValueInterpreter({
            _fundDeployer: releaseContracts_.fundDeployer,
            _wethTokenAddress: _config.wethTokenAddress,
            _chainlinkStaleRateThreshold: _config.chainlinkStaleRateThreshold
        });

        releaseContracts_.policyManager = deployPolicyManager({_fundDeployer: releaseContracts_.fundDeployer});
        releaseContracts_.externalPositionManager = deployExternalPositionManager({
            _fundDeployer: releaseContracts_.fundDeployer,
            _externalPositionFactory: _persistentContracts.externalPositionFactory,
            _policyManager: releaseContracts_.policyManager
        });
        releaseContracts_.feeManager = deployFeeManager({_fundDeployer: releaseContracts_.fundDeployer});
        releaseContracts_.integrationManager = deployIntegrationManager({
            _fundDeployer: releaseContracts_.fundDeployer,
            _policyManager: releaseContracts_.policyManager
        });

        releaseContracts_.comptrollerLibAddress = deployComptrollerLib(
            DeployComptrollerLibParams({
                dispatcher: _persistentContracts.dispatcher,
                protocolFeeReserveProxy: _persistentContracts.protocolFeeReserveProxy,
                fundDeployer: releaseContracts_.fundDeployer,
                valueInterpreter: releaseContracts_.valueInterpreter,
                feeManager: releaseContracts_.feeManager,
                policyManager: releaseContracts_.policyManager,
                mlnTokenAddress: _config.mlnTokenAddress,
                wrappedNativeTokenAddress: _config.wrappedNativeTokenAddress
            })
        );

        releaseContracts_.vaultLibAddress = deployVaultLib({
            _mlnTokenAddress: _config.mlnTokenAddress,
            _vaultMlnBurner: _config.vaultMlnBurner,
            _wrappedNativeTokenAddress: _config.wrappedNativeTokenAddress,
            _vaultPositionsLimit: _config.vaultPositionsLimit,
            _externalPositionManager: releaseContracts_.externalPositionManager,
            _protocolFeeReserveProxy: _persistentContracts.protocolFeeReserveProxy,
            _protocolFeeTracker: releaseContracts_.protocolFeeTracker
        });

        releaseContracts_.fundValueCalculator = deployFundValueCalculator({
            _feeManager: releaseContracts_.feeManager,
            _protocolFeeTracker: releaseContracts_.protocolFeeTracker,
            _valueInterpreter: releaseContracts_.valueInterpreter
        });

        vm.stopPrank();
    }

    // Pipeline - post-deployment actions

    function addExternalPositionManagerToFactory(
        IExternalPositionFactory _externalPositionFactory,
        IExternalPositionManager _externalPositionManager
    ) internal {
        IDispatcher dispatcher = IDispatcher(_externalPositionFactory.getDispatcher());

        address[] memory deployers = new address[](1);
        deployers[0] = address(_externalPositionManager);

        vm.prank(dispatcher.getOwner());
        _externalPositionFactory.addPositionDeployers(deployers);
    }

    function setFundDeployerPseudoVars(
        IFundDeployer _fundDeployer,
        IProtocolFeeTracker _protocolFeeTracker,
        address _comptrollerLibAddress,
        address _vaultLibAddress
    ) private {
        vm.startPrank(_fundDeployer.getOwner());
        _fundDeployer.setProtocolFeeTracker(address(_protocolFeeTracker));
        _fundDeployer.setComptrollerLib(_comptrollerLibAddress);
        _fundDeployer.setVaultLib(_vaultLibAddress);
        vm.stopPrank();
    }

    function setFundValueCalculatorRouterFundValueCalculators(
        IFundValueCalculatorRouter _fundValueCalculatorRouter,
        address[] memory _fundDeployers,
        address[] memory _fundValueCalculators
    ) private {
        IDispatcher dispatcher = IDispatcher(_fundValueCalculatorRouter.getDispatcher());

        vm.prank(dispatcher.getOwner());
        _fundValueCalculatorRouter.setFundValueCalculators({
            _fundDeployers: _fundDeployers,
            _fundValueCalculators: _fundValueCalculators
        });
    }

    function setReleaseLive(IDispatcher _dispatcher, IFundDeployer _fundDeployer) private {
        // Transfer release ownership to Dispatcher
        vm.prank(_fundDeployer.getOwner());
        _fundDeployer.setReleaseLive();

        // Set release as current release
        vm.prank(_dispatcher.getOwner());
        _dispatcher.setCurrentFundDeployer(address(_fundDeployer));
    }

    function setValueInterpreterEthUsdAggregator(IValueInterpreter _valueInterpreter, address _ethUsdAggregatorAddress)
        private
    {
        vm.prank(_valueInterpreter.getOwner());
        _valueInterpreter.setEthUsdAggregator(_ethUsdAggregatorAddress);
    }

    // Individual deployment functions - persistent

    function deployAddressListRegistry(IDispatcher _dispatcher) internal returns (IAddressListRegistry) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("AddressListRegistry.sol", args);
        return IAddressListRegistry(addr);
    }

    function deployDispatcher() internal returns (IDispatcher) {
        address addr = deployCode("Dispatcher.sol");
        return IDispatcher(addr);
    }

    function deployExternalPositionFactory(IDispatcher _dispatcher) internal returns (IExternalPositionFactory) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("ExternalPositionFactory.sol", args);
        return IExternalPositionFactory(addr);
    }

    function deployGlobalConfigLib(address _fundDeployerV4Address) internal returns (address) {
        bytes memory args = abi.encode(_fundDeployerV4Address);
        return deployCode("GlobalConfigLib.sol", args);
    }

    function deployGlobalConfigProxy(IDispatcher _dispatcher, address _globalConfigLibAddress)
        internal
        returns (IGlobalConfigLib)
    {
        bytes memory construct = abi.encodeWithSignature("init(address)", _dispatcher);
        bytes memory args = abi.encode(construct, _globalConfigLibAddress);
        address addr = deployCode("GlobalConfigProxy.sol", args);
        return IGlobalConfigLib(addr);
    }

    function deployProtocolFeeReserveLib() internal returns (address) {
        return deployCode("ProtocolFeeReserveLib.sol");
    }

    function deployProtocolFeeReserveProxy(IDispatcher _dispatcher, address _protocolFeeReserveLibAddress)
        internal
        returns (IProtocolFeeReserveLib)
    {
        bytes memory construct = abi.encodeWithSignature("init(address)", _dispatcher);
        bytes memory args = abi.encode(construct, _protocolFeeReserveLibAddress);
        address addr = deployCode("ProtocolFeeReserveProxy.sol", args);
        return IProtocolFeeReserveLib(addr);
    }

    function deployUintListRegistry(IDispatcher _dispatcher) internal returns (IUintListRegistry) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("UintListRegistry.sol", args);
        return IUintListRegistry(addr);
    }

    // Individual deployment functions - release

    function deployComptrollerLib(DeployComptrollerLibParams memory params) internal returns (address) {
        bytes memory args = abi.encode(
            params.dispatcher,
            params.protocolFeeReserveProxy,
            params.fundDeployer,
            params.valueInterpreter,
            params.feeManager,
            params.policyManager,
            params.mlnTokenAddress,
            params.wrappedNativeTokenAddress
        );
        return deployCode("ComptrollerLib.sol", args);
    }

    function deployExternalPositionManager(
        IFundDeployer _fundDeployer,
        IExternalPositionFactory _externalPositionFactory,
        IPolicyManager _policyManager
    ) internal returns (IExternalPositionManager) {
        bytes memory args = abi.encode(_fundDeployer, _externalPositionFactory, _policyManager);
        address addr = deployCode("ExternalPositionManager.sol", args);
        return IExternalPositionManager(addr);
    }

    function deployFeeManager(IFundDeployer _fundDeployer) internal returns (IFeeManager) {
        bytes memory args = abi.encode(_fundDeployer);
        address addr = deployCode("FeeManager.sol", args);
        return IFeeManager(addr);
    }

    function deployFundDeployer(IDispatcher _dispatcher) internal returns (IFundDeployer) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("FundDeployer.sol", args);
        return IFundDeployer(addr);
    }

    function deployFundValueCalculatorRouter(
        IDispatcher _dispatcher,
        address[] memory _fundDeployers,
        address[] memory _fundValueCalculators
    ) internal returns (IFundValueCalculatorRouter) {
        bytes memory args = abi.encode(_dispatcher, _fundDeployers, _fundValueCalculators);
        address addr = deployCode("FundValueCalculatorRouter.sol", args);
        return IFundValueCalculatorRouter(addr);
    }

    function deployFundValueCalculator(
        IFeeManager _feeManager,
        IProtocolFeeTracker _protocolFeeTracker,
        IValueInterpreter _valueInterpreter
    ) internal returns (IFundValueCalculator) {
        bytes memory args = abi.encode(_feeManager, _protocolFeeTracker, _valueInterpreter);
        address addr = deployCode("FundValueCalculator.sol", args);
        return IFundValueCalculator(addr);
    }

    function deployGasRelayPaymasterFactory(IDispatcher _dispatcher, address _gasRelayPaymasterLibAddress)
        internal
        returns (IGasRelayPaymasterFactory)
    {
        bytes memory args = abi.encode(_dispatcher, _gasRelayPaymasterLibAddress);
        address addr = deployCode("GasRelayPaymasterFactory.sol", args);
        return IGasRelayPaymasterFactory(addr);
    }

    function deployGasRelayPaymasterLib(
        address _wrappedNativeTokenAddress,
        address _gasRelayHubAddress,
        address _gasRelayTrustedForwarderAddress,
        uint256 _gasRelayDepositCooldown,
        uint256 _gasRelayDepositMaxTotal,
        uint256 _gasRelayRelayFeeMaxBase,
        uint256 _gasRelayRelayFeeMaxPercent
    ) internal returns (address) {
        bytes memory args = abi.encode(
            _wrappedNativeTokenAddress,
            _gasRelayHubAddress,
            _gasRelayTrustedForwarderAddress,
            _gasRelayDepositCooldown,
            _gasRelayDepositMaxTotal,
            _gasRelayRelayFeeMaxBase,
            _gasRelayRelayFeeMaxPercent
        );
        return deployCode("GasRelayPaymasterLib.sol", args);
    }

    function deployIntegrationManager(IFundDeployer _fundDeployer, IPolicyManager _policyManager)
        internal
        returns (IIntegrationManager)
    {
        bytes memory args = abi.encode(_fundDeployer, _policyManager);
        address addr = deployCode("IntegrationManager.sol", args);
        return IIntegrationManager(addr);
    }

    function deployPolicyManager(IFundDeployer _fundDeployer) internal returns (IPolicyManager) {
        bytes memory args = abi.encode(_fundDeployer);
        address addr = deployCode("PolicyManager.sol", args);
        return IPolicyManager(addr);
    }

    function deployProtocolFeeTracker(IFundDeployer _fundDeployer) internal returns (IProtocolFeeTracker) {
        bytes memory args = abi.encode(_fundDeployer);
        address addr = deployCode("ProtocolFeeTracker.sol", args);
        return IProtocolFeeTracker(addr);
    }

    function deployValueInterpreter(
        address _wethTokenAddress,
        IFundDeployer _fundDeployer,
        uint256 _chainlinkStaleRateThreshold
    ) internal returns (IValueInterpreter) {
        bytes memory args = abi.encode(_fundDeployer, _wethTokenAddress, _chainlinkStaleRateThreshold);
        address addr = deployCode("ValueInterpreter.sol", args);
        return IValueInterpreter(addr);
    }

    function deployVaultLib(
        address _mlnTokenAddress,
        address _vaultMlnBurner,
        address _wrappedNativeTokenAddress,
        uint256 _vaultPositionsLimit,
        IExternalPositionManager _externalPositionManager,
        IProtocolFeeReserveLib _protocolFeeReserveProxy,
        IProtocolFeeTracker _protocolFeeTracker
    ) internal returns (address) {
        bytes memory args = abi.encode(
            _externalPositionManager,
            _protocolFeeReserveProxy,
            _protocolFeeTracker,
            _mlnTokenAddress,
            _vaultMlnBurner,
            _wrappedNativeTokenAddress,
            _vaultPositionsLimit
        );
        return deployCode("VaultLib.sol", args);
    }
}
