// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

/// @title Registry Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IRegistry {
    struct IntegrationInfo {
        address gateway;
        uint256 typeIndex;
    }

    function adapterToIntegrationInfo(address) external view returns (IntegrationInfo memory);
    function derivativeToPriceSource(address) external view returns (address);
    function engine() external view returns(address);
    function feeIsRegistered(address) external view returns (bool);
    function fundIsRegistered(address) external view returns (bool);
    function fundNameHashIsTaken(bytes32) external view returns (bool);
    function fundFactory() external view returns (address);
    function getRegisteredPrimitives() external view returns (address[] memory);
    function getReserveMin(address) external view returns (uint256);
    function incentive() external view returns(uint256);
    function integrationAdapterIsRegistered(address) external view returns (bool);
    function MGM() external view returns(address);
    function mlnToken() external view returns(address);
    function nativeAsset() external view returns(address);
    function owner() external view returns(address);
    function priceSource() external view returns(address);
    function primitiveIsRegistered(address) external view returns (bool);
    function registerFund(address, address, bytes32) external;
    function sharesRequestor() external view returns(address);
    function valueInterpreter() external view returns(address);
}
