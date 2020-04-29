pragma solidity 0.6.4;

/// @title Registry Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IRegistry {
    function MGM() external view returns(address);
    function adapterMethodIsAllowed(address, bytes4) external view returns (bool);
    function assetIsRegistered(address) external view returns (bool);
    function engine() external view returns(address);
    function exchangeAdapterIsRegistered(address) external view returns (bool);
    function exchangeForAdapter(address) external view returns (address);
    function getRegisteredAssets() external view returns (address[] memory);
    function getReserveMin(address) external view returns (uint256);
    function incentive() external view returns(uint256);
    function isFeeRegistered(address) external view returns(bool);
    function isFund(address) external view returns (bool);
    function isFundFactory(address) external view returns (bool);
    function isHub(address) external view returns (bool);
    function mlnToken() external view returns(address);
    function nativeAsset() external view returns(address);
    function owner() external view returns(address);
    function priceSource() external view returns(address);
    function registerFund(address _fund, address _owner, string calldata _name) external;
    function reserveFundName(address _owner, string calldata _name) external;
    function sharesRequestor() external view returns(address);
}
