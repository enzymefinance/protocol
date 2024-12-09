// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IExternalPositionManager} from "tests/interfaces/internal/v4/IExternalPositionManager.sol";
import {IFeeManager} from "tests/interfaces/internal/v4/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/v4/IFundDeployer.sol";
import {IGasRelayPaymasterFactory} from "tests/interfaces/internal/v4/IGasRelayPaymasterFactory.sol";
import {IIntegrationManager} from "tests/interfaces/internal/v4/IIntegrationManager.sol";
import {IPolicyManager} from "tests/interfaces/internal/v4/IPolicyManager.sol";
import {IProtocolFeeTracker} from "tests/interfaces/internal/v4/IProtocolFeeTracker.sol";
import {IUsdEthSimulatedAggregator} from "tests/interfaces/internal/v4/IUsdEthSimulatedAggregator.sol";
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
    IUsdEthSimulatedAggregator usdEthSimulatedAggregator;
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
        valueInterpreter: IValueInterpreter(0xD7B0610dB501b15Bfb9B7DDad8b3869de262a327),
        usdEthSimulatedAggregator: IUsdEthSimulatedAggregator(0x9579f735d0C93B5eef064Fe312CA3509BD695206)
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
        valueInterpreter: IValueInterpreter(0x66De7e286Aae66f7f3Daf693c22d16EEa48a0f45),
        usdEthSimulatedAggregator: IUsdEthSimulatedAggregator(0x51e75b5E0eef2d40B4D70C5dAa2666E1eA30F0Bd)
    });
}

function getArbitrumDeployment() pure returns (Contracts memory contracts_) {
    return Contracts({
        // Core
        comptrollerLibAddress: 0x3868C0FC34B6ecE124c6ab122f6f29E978Be6661,
        fundDeployer: IFundDeployer(0xa2B4c827dE13D4e9801eA1Ca837524a1A148Dec3),
        vaultLibAddress: 0xE1A147b3FB8a7bE78bf3A061F176bC718D897695,
        // Extensions
        externalPositionManager: IExternalPositionManager(0x90B53aefdbD2Ba3573d965d2D98951F2aA00507d),
        feeManager: IFeeManager(0x2C46503D4a0313c7161a5593B6865BaA194b466f),
        integrationManager: IIntegrationManager(0x55dF97AcA98c2a708721f28eA1Ca42A2bE7FF934),
        policyManager: IPolicyManager(0xbDe1E8C4A061cd28F4871860dDf22200B85ee9Ec),
        // Infrastructure
        gasRelayPaymasterFactory: IGasRelayPaymasterFactory(0xe922362AA3426bd683B63a8e5d13903A9cFC4Cbb),
        protocolFeeTracker: IProtocolFeeTracker(0xE71227D6D846e0fb3367D020683327031c4c4A3D),
        valueInterpreter: IValueInterpreter(0xDd5F18a52A63eCECF502A165A459D33BE5C0a06C),
        usdEthSimulatedAggregator: IUsdEthSimulatedAggregator(address(0)) // Not deployed on Arbitrum
    });
}

function getBaseChainDeployment() pure returns (Contracts memory contracts_) {
    return Contracts({
        // Core
        comptrollerLibAddress: 0x67132b2D9B31fFcab67C9216f3FA937B259673B8,
        fundDeployer: IFundDeployer(0xbB274DF654F71827cca120e0B916AEC1f2cEaaEb),
        vaultLibAddress: 0x944d01bF533Ed041d9947826429F086bf56C5856,
        // Extensions
        externalPositionManager: IExternalPositionManager(0xE7E6db86B10E2CF1F409eb635998dE81C841330f),
        feeManager: IFeeManager(0xa9928195a36ef1C238B1B8B5912B9fBCe7554F73),
        integrationManager: IIntegrationManager(0x5D8703b4a08Fd3F698bAFD5389fa25463fb383dD),
        policyManager: IPolicyManager(0x7d1a8314c6a56A8312053Bfd5A3b9e4C768E8D24),
        // Infrastructure
        gasRelayPaymasterFactory: IGasRelayPaymasterFactory(0xc6780E244Fd22f21F019fEC4b802019D17BD558D),
        protocolFeeTracker: IProtocolFeeTracker(0x44ddf1831fb1f9CD62Bd07b4C351C826751594A6),
        valueInterpreter: IValueInterpreter(0xA76BC052a4D200d851C27312B32c35502824E8e1),
        usdEthSimulatedAggregator: IUsdEthSimulatedAggregator(address(0)) // Not deployed on Base
    });
}
