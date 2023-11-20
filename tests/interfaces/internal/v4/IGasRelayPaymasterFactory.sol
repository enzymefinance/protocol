// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IGasRelayPaymasterFactory {
    event CanonicalLibSet(address nextCanonicalLib);
    event ProxyDeployed(address indexed caller, address proxy, bytes constructData);

    function deployProxy(bytes memory _constructData) external returns (address proxy_);
    function getCanonicalLib() external view returns (address canonicalLib_);
    function getDispatcher() external view returns (address dispatcher_);
    function getOwner() external view returns (address owner_);
    function setCanonicalLib(address _nextCanonicalLib) external;
}
