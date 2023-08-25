// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

interface IHelperDataReader {
    function getVaultDetailsExtended(address _vaultProxy) external returns (bytes memory);

    function getVaultDetails(address _vaultProxy) external returns (bytes memory);

    function getVaultActiveExternalPositionsDetails(address _vaultProxy) external returns (bytes memory);

    function getVaultPoliciesDetails(address _vaultProxy) external returns (bytes memory);

    function getVaultFeesDetails(address _vaultProxy) external returns (bytes memory);

    function getVaultTrackedAssetsAmounts(address _vaultProxy) external returns (bytes memory);
}
