// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IComptrollerLib {
    event AutoProtocolFeeSharesBuybackSet(bool autoProtocolFeeSharesBuyback);
    event BuyBackMaxProtocolFeeSharesFailed(
        bytes indexed failureReturnData, uint256 sharesAmount, uint256 buybackValueInMln, uint256 gav
    );
    event DeactivateFeeManagerFailed();
    event GasRelayPaymasterSet(address gasRelayPaymaster);
    event MigratedSharesDuePaid(uint256 sharesDue);
    event PayProtocolFeeDuringDestructFailed();
    event PreRedeemSharesHookFailed(bytes indexed failureReturnData, address indexed redeemer, uint256 sharesAmount);
    event RedeemSharesInKindCalcGavFailed();
    event SharesBought(address indexed buyer, uint256 investmentAmount, uint256 sharesIssued, uint256 sharesReceived);
    event SharesRedeemed(
        address indexed redeemer,
        address indexed recipient,
        uint256 sharesAmount,
        address[] receivedAssets,
        uint256[] receivedAssetAmounts
    );
    event VaultProxySet(address vaultProxy);

    function activate(bool _isMigration) external;
    function buyBackProtocolFeeShares(uint256 _sharesAmount) external;
    function buyShares(uint256 _investmentAmount, uint256 _minSharesQuantity)
        external
        returns (uint256 sharesReceived_);
    function buySharesOnBehalf(address _buyer, uint256 _investmentAmount, uint256 _minSharesQuantity)
        external
        returns (uint256 sharesReceived_);
    function calcGav() external returns (uint256 gav_);
    function calcGrossShareValue() external returns (uint256 grossShareValue_);
    function callOnExtension(address _extension, uint256 _actionId, bytes memory _callArgs) external;
    function deployGasRelayPaymaster() external;
    function depositToGasRelayPaymaster() external;
    function destructActivated(uint256 _deactivateFeeManagerGasLimit, uint256 _payProtocolFeeGasLimit) external;
    function destructUnactivated() external;
    function doesAutoProtocolFeeSharesBuyback() external view returns (bool doesAutoBuyback_);
    function getDenominationAsset() external view returns (address denominationAsset_);
    function getDispatcher() external view returns (address dispatcher_);
    function getExternalPositionManager() external view returns (address externalPositionManager_);
    function getFeeManager() external view returns (address feeManager_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getGasRelayPaymaster() external view returns (address gasRelayPaymaster_);
    function getGasRelayPaymasterFactory() external view returns (address gasRelayPaymasterFactory_);
    function getGasRelayTrustedForwarder() external view returns (address trustedForwarder_);
    function getIntegrationManager() external view returns (address integrationManager_);
    function getLastSharesBoughtTimestampForAccount(address _who)
        external
        view
        returns (uint256 lastSharesBoughtTimestamp_);
    function getMlnToken() external view returns (address mlnToken_);
    function getPolicyManager() external view returns (address policyManager_);
    function getProtocolFeeReserve() external view returns (address protocolFeeReserve_);
    function getSharesActionTimelock() external view returns (uint256 sharesActionTimelock_);
    function getValueInterpreter() external view returns (address valueInterpreter_);
    function getVaultProxy() external view returns (address vaultProxy_);
    function getWethToken() external view returns (address wethToken_);
    function init(address _denominationAsset, uint256 _sharesActionTimelock) external;
    function permissionedVaultAction(uint8 _action, bytes memory _actionData) external;
    function preTransferSharesHook(address _sender, address _recipient, uint256 _amount) external;
    function preTransferSharesHookFreelyTransferable(address _sender) external view;
    function pullWethForGasRelayer(uint256 _amount) external;
    function redeemSharesForSpecificAssets(
        address _recipient,
        uint256 _sharesQuantity,
        address[] memory _payoutAssets,
        uint256[] memory _payoutAssetPercentages
    ) external returns (uint256[] memory payoutAmounts_);
    function redeemSharesInKind(
        address _recipient,
        uint256 _sharesQuantity,
        address[] memory _additionalAssets,
        address[] memory _assetsToSkip
    ) external returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_);
    function setAutoProtocolFeeSharesBuyback(bool _nextAutoProtocolFeeSharesBuyback) external;
    function setGasRelayPaymaster(address _nextGasRelayPaymaster) external;
    function setVaultProxy(address _vaultProxy) external;
    function shutdownGasRelayPaymaster() external;
    function vaultCallOnContract(address _contract, bytes4 _selector, bytes memory _encodedArgs)
        external
        returns (bytes memory returnData_);
}
