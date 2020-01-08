pragma solidity 0.6.1;


contract Factory {
    mapping (address => bool) public childExists;

    event NewInstance(
        address indexed hub,
        address indexed instance
    );

    function isInstance(address _child) public view returns (bool) {
        return childExists[_child];
    }
}
