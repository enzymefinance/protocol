// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IFeeManager {
    event FeeEnabledForFund(address indexed comptrollerProxy, address indexed fee, bytes settingsData);
    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        uint8 indexed settlementType,
        address payer,
        address payee,
        uint256 sharesDue
    );
    event SharesOutstandingPaidForFund(
        address indexed comptrollerProxy, address indexed fee, address indexed payee, uint256 sharesDue
    );
    event ValidatedVaultProxySetForFund(address indexed comptrollerProxy, address indexed vaultProxy);

    function activateForFund(bool) external;
    function deactivateForFund() external;
    function getEnabledFeesForFund(address _comptrollerProxy) external view returns (address[] memory enabledFees_);
    function getFeeSharesOutstandingForFund(address _comptrollerProxy, address _fee)
        external
        view
        returns (uint256 sharesOutstanding_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getOwner() external view returns (address owner_);
    function getVaultProxyForFund(address _comptrollerProxy) external view returns (address vaultProxy_);
    function invokeHook(uint8 _hook, bytes memory _settlementData, uint256 _gav) external;
    function receiveCallFromComptroller(address, uint256 _actionId, bytes memory _callArgs) external;
    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes memory _configData) external;
}
