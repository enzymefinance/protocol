// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IGasRelayPaymasterLib} from "tests/interfaces/internal/IGasRelayPaymasterLib.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IProtocolFeeReserve} from "tests/interfaces/internal/IProtocolFeeReserve.sol";
import {IProtocolFeeTracker} from "tests/interfaces/internal/IProtocolFeeTracker.sol";
import {IUintListRegistry} from "tests/interfaces/internal/IUintListRegistry.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IGasRelayPaymasterFactory} from "tests/interfaces/internal/IGasRelayPaymasterFactory.sol";

interface ICoreDeployment {
    struct Deployment {
        Config config;
        Persistent persistent;
        Release release;
    }

    struct Config {
        IERC20 wrappedNativeToken;
        IERC20 wethToken;
        IERC20 mlnToken;
        address gasRelayHub;
        address gasRelayTrustedForwarder;
        uint256 gasRelayDepositCooldown;
        uint256 gasRelayDepositMaxTotal;
        uint256 gasRelayRelayFeeMaxBase;
        uint256 gasRelayFeeMaxPercent;
        address vaultMlnBurner;
        uint256 vaultPositionsLimit;
        uint256 chainlinkStaleRateThreshold;
        address ethUsdAggregator;
    }

    struct Persistent {
        IDispatcher dispatcher;
        IExternalPositionFactory externalPositionFactory;
        IGasRelayPaymasterLib gasRelayPaymasterLib;
        IGasRelayPaymasterFactory gasRelayPaymasterFactory;
        address protocolFeeReserveLib;
        IProtocolFeeReserve protocolFeeReserveProxy;
        IAddressListRegistry addressListRegistry;
        IUintListRegistry uintListRegistry;
    }

    struct Release {
        IFundDeployer fundDeployer;
        IValueInterpreter valueInterpreter;
        IPolicyManager policyManager;
        IExternalPositionManager externalPositionManager;
        IFeeManager feeManager;
        IIntegrationManager integrationManager;
        address comptrollerLib;
        IProtocolFeeTracker protocolFeeTracker;
        address vaultLib;
    }
}

abstract contract DeploymentUtils is CoreUtilsBase {
    function deployRelease(ICoreDeployment.Deployment memory _previousDeployment)
        internal
        returns (ICoreDeployment.Deployment memory)
    {
        return deployRelease(
            _previousDeployment,
            _previousDeployment.config.vaultMlnBurner,
            _previousDeployment.config.vaultPositionsLimit,
            _previousDeployment.config.chainlinkStaleRateThreshold
        );
    }

    function deployRelease(
        ICoreDeployment.Deployment memory _previousDeployment,
        address _vaultMlnBurner,
        uint256 _vaultPositionsLimit,
        uint256 _chainlinkStaleRateThreshold
    ) internal returns (ICoreDeployment.Deployment memory deployment_) {
        deployment_.config = ICoreDeployment.Config({
            wrappedNativeToken: _previousDeployment.config.wrappedNativeToken,
            wethToken: _previousDeployment.config.wethToken,
            mlnToken: _previousDeployment.config.mlnToken,
            gasRelayHub: _previousDeployment.config.gasRelayHub,
            gasRelayTrustedForwarder: _previousDeployment.config.gasRelayTrustedForwarder,
            gasRelayDepositCooldown: _previousDeployment.config.gasRelayDepositCooldown,
            gasRelayDepositMaxTotal: _previousDeployment.config.gasRelayDepositMaxTotal,
            gasRelayRelayFeeMaxBase: _previousDeployment.config.gasRelayRelayFeeMaxBase,
            gasRelayFeeMaxPercent: _previousDeployment.config.gasRelayFeeMaxPercent,
            ethUsdAggregator: _previousDeployment.config.ethUsdAggregator,
            vaultMlnBurner: _vaultMlnBurner,
            vaultPositionsLimit: _vaultPositionsLimit,
            chainlinkStaleRateThreshold: _chainlinkStaleRateThreshold
        });
        deployment_.persistent = ICoreDeployment.Persistent({
            dispatcher: _previousDeployment.persistent.dispatcher,
            externalPositionFactory: _previousDeployment.persistent.externalPositionFactory,
            gasRelayPaymasterLib: _previousDeployment.persistent.gasRelayPaymasterLib,
            gasRelayPaymasterFactory: _previousDeployment.persistent.gasRelayPaymasterFactory,
            protocolFeeReserveLib: _previousDeployment.persistent.protocolFeeReserveLib,
            protocolFeeReserveProxy: _previousDeployment.persistent.protocolFeeReserveProxy,
            addressListRegistry: _previousDeployment.persistent.addressListRegistry,
            uintListRegistry: _previousDeployment.persistent.uintListRegistry
        });
        deployment_.release = deployReleaseCore(deployment_.config, deployment_.persistent);
    }

    function deployRelease(
        IERC20 _wrappedNativeToken,
        IERC20 _wethToken,
        IERC20 _mlnToken,
        address _gasRelayHub,
        address _gasRelayTrustedForwarder,
        uint256 _gasRelayDepositCooldown,
        uint256 _gasRelayDepositMaxTotal,
        uint256 _gasRelayRelayFeeMaxBase,
        uint256 _gasRelayFeeMaxPercent,
        address _vaultMlnBurner,
        uint256 _vaultPositionsLimit,
        uint256 _chainlinkStaleRateThreshold,
        address _ethUsdAggregator
    ) internal returns (ICoreDeployment.Deployment memory deployment_) {
        deployment_.config = ICoreDeployment.Config({
            wrappedNativeToken: _wrappedNativeToken,
            wethToken: _wethToken,
            mlnToken: _mlnToken,
            gasRelayHub: _gasRelayHub,
            gasRelayTrustedForwarder: _gasRelayTrustedForwarder,
            gasRelayDepositCooldown: _gasRelayDepositCooldown,
            gasRelayDepositMaxTotal: _gasRelayDepositMaxTotal,
            gasRelayRelayFeeMaxBase: _gasRelayRelayFeeMaxBase,
            gasRelayFeeMaxPercent: _gasRelayFeeMaxPercent,
            vaultMlnBurner: _vaultMlnBurner,
            vaultPositionsLimit: _vaultPositionsLimit,
            chainlinkStaleRateThreshold: _chainlinkStaleRateThreshold,
            ethUsdAggregator: _ethUsdAggregator
        });
        deployment_.persistent = deployPersistentCore(deployment_.config);
        deployment_.release = deployReleaseCore(deployment_.config, deployment_.persistent);
    }

    function deployPersistentCore(ICoreDeployment.Config memory _config)
        private
        returns (ICoreDeployment.Persistent memory persistent_)
    {
        persistent_.dispatcher = deployDispatcher();
        persistent_.externalPositionFactory = deployExternalPositionFactory({_dispatcher: persistent_.dispatcher});
        persistent_.gasRelayPaymasterLib = deployGasRelayPaymasterLib({
            _wrappedNativeToken: _config.wrappedNativeToken,
            _gasRelayHub: _config.gasRelayHub,
            _gasRelayTrustedForwarder: _config.gasRelayTrustedForwarder,
            _gasRelayDepositCooldown: _config.gasRelayDepositCooldown,
            _gasRelayDepositMaxTotal: _config.gasRelayDepositMaxTotal,
            _gasRelayRelayFeeMaxBase: _config.gasRelayRelayFeeMaxBase,
            _gasRelayRelayFeeMaxPercent: _config.gasRelayFeeMaxPercent
        });

        persistent_.gasRelayPaymasterFactory = deployGasRelayPaymasterFactory({
            _dispatcher: persistent_.dispatcher,
            _gasRelayPaymasterLib: persistent_.gasRelayPaymasterLib
        });
        persistent_.protocolFeeReserveLib = deployProtocolFeeReserveLib();
        persistent_.protocolFeeReserveProxy = deployProtocolFeeReserveProxy({
            _dispatcher: persistent_.dispatcher,
            _protocolFeeReserveLib: persistent_.protocolFeeReserveLib
        });
        persistent_.addressListRegistry = deployAddressListRegistry({_dispatcher: persistent_.dispatcher});
        persistent_.uintListRegistry = deployUintListRegistry({_dispatcher: persistent_.dispatcher});
    }

    function deployReleaseCore(ICoreDeployment.Config memory _config, ICoreDeployment.Persistent memory _persistent)
        private
        returns (ICoreDeployment.Release memory release_)
    {
        release_.fundDeployer = deployFundDeployer({
            _dispatcher: _persistent.dispatcher,
            _gasRelayPaymasterFactory: _persistent.gasRelayPaymasterFactory
        });
        release_.valueInterpreter = deployValueInterpreter({
            _fundDeployer: release_.fundDeployer,
            _wethToken: _config.wethToken,
            _chainlinkStaleRateThreshold: _config.chainlinkStaleRateThreshold
        });
        release_.policyManager = deployPolicyManager({
            _fundDeployer: release_.fundDeployer,
            _gasRelayPaymasterFactory: _persistent.gasRelayPaymasterFactory
        });
        release_.externalPositionManager = deployExternalPositionManager({
            _fundDeployer: release_.fundDeployer,
            _externalPositionFactory: _persistent.externalPositionFactory,
            _policyManager: release_.policyManager
        });
        release_.feeManager = deployFeeManager({_fundDeployer: release_.fundDeployer});
        release_.integrationManager = deployIntegrationManager({
            _fundDeployer: release_.fundDeployer,
            _policyManager: release_.policyManager,
            _valueInterpreter: release_.valueInterpreter
        });
        release_.comptrollerLib = deployComptrollerLib(
            ComptrollerLibParams({
                mlnToken: _config.mlnToken,
                wrappedNativeToken: _config.wrappedNativeToken,
                dispatcher: _persistent.dispatcher,
                fundDeployer: release_.fundDeployer,
                policyManager: release_.policyManager,
                feeManager: release_.feeManager,
                valueInterpreter: release_.valueInterpreter,
                integrationManager: release_.integrationManager,
                externalPositionManager: release_.externalPositionManager,
                gasRelayPaymasterFactory: _persistent.gasRelayPaymasterFactory,
                protocolFeeReserveProxy: _persistent.protocolFeeReserveProxy
            })
        );
        release_.protocolFeeTracker = deployProtocolFeeTracker({_fundDeployer: release_.fundDeployer});
        release_.vaultLib = deployVaultLib({
            _mlnToken: _config.mlnToken,
            _vaultMlnBurner: _config.vaultMlnBurner,
            _wrappedNativeToken: _config.wrappedNativeToken,
            _vaultPositionsLimit: _config.vaultPositionsLimit,
            _externalPositionManager: release_.externalPositionManager,
            _gasRelayPaymasterFactory: _persistent.gasRelayPaymasterFactory,
            _protocolFeeReserveProxy: _persistent.protocolFeeReserveProxy,
            _protocolFeeTracker: release_.protocolFeeTracker
        });

        setFundDeployerPseudoVars({
            _fundDeployer: release_.fundDeployer,
            _protocolFeeTracker: release_.protocolFeeTracker,
            _comptrollerLib: release_.comptrollerLib,
            _vaultLib: release_.vaultLib
        });
        setExternalPositionFactoryPositionDeployers({
            _externalPositionManager: release_.externalPositionManager,
            _externalPositionFactory: _persistent.externalPositionFactory,
            _dispatcher: _persistent.dispatcher
        });

        if (_config.ethUsdAggregator != address(0)) {
            setValueInterpreterEthUsdAggregator({
                _valueInterpreter: release_.valueInterpreter,
                _fundDeployer: release_.fundDeployer,
                _ethUsdAggregator: _config.ethUsdAggregator
            });
        }
    }

    function setExternalPositionFactoryPositionDeployers(ICoreDeployment.Deployment memory _deployment) internal {
        setExternalPositionFactoryPositionDeployers({
            _externalPositionManager: _deployment.release.externalPositionManager,
            _externalPositionFactory: _deployment.persistent.externalPositionFactory,
            _dispatcher: _deployment.persistent.dispatcher
        });
    }

    function setExternalPositionFactoryPositionDeployers(
        IExternalPositionManager _externalPositionManager,
        IExternalPositionFactory _externalPositionFactory,
        IDispatcher _dispatcher
    ) private {
        address[] memory deployers = new address[](1);
        deployers[0] = address(_externalPositionManager);
        vm.prank(_dispatcher.getOwner());
        _externalPositionFactory.addPositionDeployers(deployers);
    }

    function setValueInterpreterEthUsdAggregator(
        IValueInterpreter _valueInterpreter,
        IFundDeployer _fundDeployer,
        address _ethUsdAggregator
    ) private {
        vm.prank(_fundDeployer.getOwner());
        _valueInterpreter.setEthUsdAggregator(_ethUsdAggregator);
    }

    function setFundDeployerPseudoVars(ICoreDeployment.Deployment memory _deployment) internal {
        setFundDeployerPseudoVars({
            _fundDeployer: _deployment.release.fundDeployer,
            _protocolFeeTracker: _deployment.release.protocolFeeTracker,
            _comptrollerLib: _deployment.release.comptrollerLib,
            _vaultLib: _deployment.release.vaultLib
        });
    }

    function setFundDeployerPseudoVars(
        IFundDeployer _fundDeployer,
        IProtocolFeeTracker _protocolFeeTracker,
        address _comptrollerLib,
        address _vaultLib
    ) private {
        vm.startPrank(_fundDeployer.getOwner());
        _fundDeployer.setProtocolFeeTracker(address(_protocolFeeTracker));
        _fundDeployer.setComptrollerLib(address(_comptrollerLib));
        _fundDeployer.setVaultLib(address(_vaultLib));
        vm.stopPrank();
    }

    function setReleaseLive(ICoreDeployment.Deployment memory _deployment) internal {
        setReleaseLive({_dispatcher: _deployment.persistent.dispatcher, _fundDeployer: _deployment.release.fundDeployer});
    }

    function setReleaseLive(IDispatcher _dispatcher, IFundDeployer _fundDeployer) private {
        vm.prank(_fundDeployer.getOwner());
        _fundDeployer.setReleaseLive();
        vm.prank(_dispatcher.getOwner());
        _dispatcher.setCurrentFundDeployer(address(_fundDeployer));
    }

    // Persistent

    function deployDispatcher() internal returns (IDispatcher) {
        address addr = deployCode("Dispatcher.sol");
        return IDispatcher(addr);
    }

    function deployExternalPositionFactory(IDispatcher _dispatcher) internal returns (IExternalPositionFactory) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("ExternalPositionFactory.sol", args);
        return IExternalPositionFactory(addr);
    }

    function deployGasRelayPaymasterLib(
        IERC20 _wrappedNativeToken,
        address _gasRelayHub,
        address _gasRelayTrustedForwarder,
        uint256 _gasRelayDepositCooldown,
        uint256 _gasRelayDepositMaxTotal,
        uint256 _gasRelayRelayFeeMaxBase,
        uint256 _gasRelayRelayFeeMaxPercent
    ) internal returns (IGasRelayPaymasterLib) {
        bytes memory args = abi.encode(
            _wrappedNativeToken,
            _gasRelayHub,
            _gasRelayTrustedForwarder,
            _gasRelayDepositCooldown,
            _gasRelayDepositMaxTotal,
            _gasRelayRelayFeeMaxBase,
            _gasRelayRelayFeeMaxPercent
        );
        return IGasRelayPaymasterLib(deployCode("GasRelayPaymasterLib.sol", args));
    }

    function deployGasRelayPaymasterFactory(IDispatcher _dispatcher, IGasRelayPaymasterLib _gasRelayPaymasterLib)
        internal
        returns (IGasRelayPaymasterFactory)
    {
        bytes memory args = abi.encode(_dispatcher, _gasRelayPaymasterLib);
        address addr = deployCode("GasRelayPaymasterFactory.sol", args);
        return IGasRelayPaymasterFactory(addr);
    }

    function deployProtocolFeeReserveLib() internal returns (address) {
        return deployCode("ProtocolFeeReserveLib.sol");
    }

    function deployProtocolFeeReserveProxy(IDispatcher _dispatcher, address _protocolFeeReserveLib)
        internal
        returns (IProtocolFeeReserve)
    {
        bytes memory construct = abi.encodeWithSignature("init(address)", _dispatcher);
        bytes memory args = abi.encode(construct, _protocolFeeReserveLib);
        address addr = deployCode("ProtocolFeeReserveProxy.sol", args);
        return IProtocolFeeReserve(addr);
    }

    function deployAddressListRegistry(IDispatcher _dispatcher) internal returns (IAddressListRegistry) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("AddressListRegistry.sol", args);
        return IAddressListRegistry(addr);
    }

    function deployUintListRegistry(IDispatcher _dispatcher) internal returns (IUintListRegistry) {
        bytes memory args = abi.encode(_dispatcher);
        address addr = deployCode("UintListRegistry.sol", args);
        return IUintListRegistry(addr);
    }

    // Release

    // TODO: This is required because we run into a stack-too-deep error otherwise.
    struct ComptrollerLibParams {
        IDispatcher dispatcher;
        IProtocolFeeReserve protocolFeeReserveProxy;
        IFundDeployer fundDeployer;
        IValueInterpreter valueInterpreter;
        IExternalPositionManager externalPositionManager;
        IFeeManager feeManager;
        IIntegrationManager integrationManager;
        IPolicyManager policyManager;
        IGasRelayPaymasterFactory gasRelayPaymasterFactory;
        IERC20 mlnToken;
        IERC20 wrappedNativeToken;
    }

    function deployComptrollerLib(ComptrollerLibParams memory params) internal returns (address) {
        bytes memory args = abi.encode(
            params.dispatcher,
            params.protocolFeeReserveProxy,
            params.fundDeployer,
            params.valueInterpreter,
            params.externalPositionManager,
            params.feeManager,
            params.integrationManager,
            params.policyManager,
            params.gasRelayPaymasterFactory,
            params.mlnToken,
            params.wrappedNativeToken
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

    function deployFundDeployer(IDispatcher _dispatcher, IGasRelayPaymasterFactory _gasRelayPaymasterFactory)
        internal
        returns (IFundDeployer)
    {
        bytes memory args = abi.encode(_dispatcher, _gasRelayPaymasterFactory);
        address addr = deployCode("FundDeployer.sol", args);
        return IFundDeployer(addr);
    }

    function deployIntegrationManager(
        IFundDeployer _fundDeployer,
        IPolicyManager _policyManager,
        IValueInterpreter _valueInterpreter
    ) internal returns (IIntegrationManager) {
        bytes memory args = abi.encode(_fundDeployer, _policyManager, _valueInterpreter);
        address addr = deployCode("IntegrationManager.sol", args);
        return IIntegrationManager(addr);
    }

    function deployPolicyManager(IFundDeployer _fundDeployer, IGasRelayPaymasterFactory _gasRelayPaymasterFactory)
        internal
        returns (IPolicyManager)
    {
        bytes memory args = abi.encode(_fundDeployer, _gasRelayPaymasterFactory);
        address addr = deployCode("PolicyManager.sol", args);
        return IPolicyManager(addr);
    }

    function deployProtocolFeeTracker(IFundDeployer _fundDeployer) internal returns (IProtocolFeeTracker) {
        bytes memory args = abi.encode(_fundDeployer);
        address addr = deployCode("ProtocolFeeTracker.sol", args);
        return IProtocolFeeTracker(addr);
    }

    function deployValueInterpreter(
        IERC20 _wethToken,
        IFundDeployer _fundDeployer,
        uint256 _chainlinkStaleRateThreshold
    ) internal returns (IValueInterpreter) {
        bytes memory args = abi.encode(_fundDeployer, _wethToken, _chainlinkStaleRateThreshold);
        address addr = deployCode("ValueInterpreter.sol", args);
        return IValueInterpreter(addr);
    }

    function deployVaultLib(
        IERC20 _mlnToken,
        address _vaultMlnBurner,
        IERC20 _wrappedNativeToken,
        uint256 _vaultPositionsLimit,
        IExternalPositionManager _externalPositionManager,
        IGasRelayPaymasterFactory _gasRelayPaymasterFactory,
        IProtocolFeeReserve _protocolFeeReserveProxy,
        IProtocolFeeTracker _protocolFeeTracker
    ) internal returns (address) {
        bytes memory args = abi.encode(
            _externalPositionManager,
            _gasRelayPaymasterFactory,
            _protocolFeeReserveProxy,
            _protocolFeeTracker,
            _mlnToken,
            _vaultMlnBurner,
            _wrappedNativeToken,
            _vaultPositionsLimit
        );
        return deployCode("VaultLib.sol", args);
    }
}
