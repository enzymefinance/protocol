// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

// TODO: full v5 interfaces should be archived and used here rather than relying on current versions
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IFundValueCalculator} from "tests/interfaces/internal/IFundValueCalculator.sol";
import {IGasRelayPaymasterFactory} from "tests/interfaces/internal/IGasRelayPaymasterFactory.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IProtocolFeeTracker} from "tests/interfaces/internal/IProtocolFeeTracker.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

struct Contracts {
    // Core
    address comptrollerLibAddress;
    IFundDeployer fundDeployer;
    address vaultLibAddress;
    // Extensions
    IExternalPositionManager externalPositionManager;
    IFeeManager feeManager;
    IIntegrationManager integrationManager;
    IPolicyManager policyManager;
    // Infrastructure
    IGasRelayPaymasterFactory gasRelayPaymasterFactory;
    IProtocolFeeTracker protocolFeeTracker;
    IValueInterpreter valueInterpreter;
    IFundValueCalculator fundValueCalculator;
}

function getMainnetDeployment() pure returns (Contracts memory contracts_) {
    // placeholder
    return contracts_;
}

function getPolygonDeployment() pure returns (Contracts memory contracts_) {
    // placeholder
    return contracts_;
}

function getArbitrumDeployment() pure returns (Contracts memory contracts_) {
    // placeholder
    return contracts_;
}

function getBaseChainDeployment() pure returns (Contracts memory contracts_) {
    // placeholder
    return contracts_;
}
