// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IExternalPositionManager} from "tests/interfaces/internal/v4/IExternalPositionManager.sol";
import {IFeeManager} from "tests/interfaces/internal/v4/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/v4/IFundDeployer.sol";
import {IGasRelayPaymasterFactory} from "tests/interfaces/internal/v4/IGasRelayPaymasterFactory.sol";
import {IIntegrationManager} from "tests/interfaces/internal/v4/IIntegrationManager.sol";
import {IPolicyManager} from "tests/interfaces/internal/v4/IPolicyManager.sol";
import {IProtocolFeeTracker} from "tests/interfaces/internal/v4/IProtocolFeeTracker.sol";
import {IValueInterpreter} from "tests/interfaces/internal/v4/IValueInterpreter.sol";

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
}

function getMainnetDeployment() pure returns (Contracts memory) {
    return Contracts({
        // Core
        comptrollerLibAddress: 0x03F7f3B8Da875881206655D8099B9DACf721f1EF,
        fundDeployer: IFundDeployer(0x4f1C53F096533C04d8157EFB6Bca3eb22ddC6360),
        vaultLibAddress: 0x891dee0483eBAA922E274ddD2eBBaA2D33468A38,
        // Extensions
        externalPositionManager: IExternalPositionManager(0x1e3dA40f999Cf47091F869EbAc477d84b0827Cf4),
        feeManager: IFeeManager(0xAf0DFFAC1CE85c3fCe4c2BF50073251F615EefC4),
        integrationManager: IIntegrationManager(0x31329024f1a3E4a4B3336E0b1DfA74CC3FEc633e),
        policyManager: IPolicyManager(0xADF5A8DB090627b153Ef0c5726ccfdc1c7aED7bd),
        // Infrastructure
        gasRelayPaymasterFactory: IGasRelayPaymasterFactory(0x846bbe1925047023651de7EC289f329c24ded3a8),
        protocolFeeTracker: IProtocolFeeTracker(0xe97980f1D43C4CD4F1EeF0277a2DeA7ddBc2Cd13),
        valueInterpreter: IValueInterpreter(0xD7B0610dB501b15Bfb9B7DDad8b3869de262a327)
    });
}

function getPolygonDeployment() pure returns (Contracts memory) {
    return Contracts({
        // Core
        comptrollerLibAddress: 0xf5fc0e36c85552E44354132D188C33D9361eB441,
        fundDeployer: IFundDeployer(0x188d356cAF78bc6694aEE5969FDE99a9D612284F),
        vaultLibAddress: 0xddb8ebe5361Ca93614E5efB34049E842912e1612,
        // Extensions
        externalPositionManager: IExternalPositionManager(0x9513b3a49FC9aE8B76942C94fb6f660c41FD7F47),
        feeManager: IFeeManager(0xddD7432671F5aDC1C82c7c875624C1B0BC461DeB),
        integrationManager: IIntegrationManager(0x92fCdE09790671cf085864182B9670c77da0884B),
        policyManager: IPolicyManager(0x5a8Ee0850d22FfeF4169DbD348c1b0d7d5f5546F),
        // Infrastructure
        gasRelayPaymasterFactory: IGasRelayPaymasterFactory(0xeD05786Ef7b5e5bf909512f0Ad46eb8f22cDC4Ca),
        protocolFeeTracker: IProtocolFeeTracker(0xB8E6EDa0cE8fddD21F0b0268A43a57b9296E23d5),
        valueInterpreter: IValueInterpreter(0x66De7e286Aae66f7f3Daf693c22d16EEa48a0f45)
    });
}
