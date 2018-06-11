pragma solidity ^0.4.21;

interface Policy {
    function rule() external view returns (bool);
}
