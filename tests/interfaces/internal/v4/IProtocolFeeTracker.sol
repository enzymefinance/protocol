// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IProtocolFeeTracker {
    event FeeBpsDefaultSet(uint256 nextFeeBpsDefault);
    event FeeBpsOverrideSetForVault(address indexed vaultProxy, uint256 nextFeeBpsOverride);
    event FeePaidForVault(address indexed vaultProxy, uint256 sharesAmount, uint256 secondsPaid);
    event InitializedForVault(address vaultProxy);
    event LastPaidSetForVault(address indexed vaultProxy, uint256 prevTimestamp, uint256 nextTimestamp);

    function getFeeBpsDefault() external view returns (uint256 feeBpsDefault_);
    function getFeeBpsForVault(address _vaultProxy) external view returns (uint256 feeBps_);
    function getFeeBpsOverrideForVault(address _vaultProxy) external view returns (uint256 feeBpsOverride_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getLastPaidForVault(address _vaultProxy) external view returns (uint256 lastPaid_);
    function getOwner() external view returns (address owner_);
    function initializeForVault(address _vaultProxy) external;
    function payFee() external returns (uint256 sharesDue_);
    function setFeeBpsDefault(uint256 _nextFeeBpsDefault) external;
    function setFeeBpsOverrideForVault(address _vaultProxy, uint256 _nextFeeBpsOverride) external;
    function setLastPaidForVault(address _vaultProxy, uint256 _nextTimestamp) external;
}
