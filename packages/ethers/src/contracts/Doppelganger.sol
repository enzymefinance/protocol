/* solium-disable security/no-inline-assembly */
pragma experimental ABIEncoderV2;
pragma solidity ^0.6.8;

contract Doppelganger {
    struct MockCall {
        bool initialized;
        bytes value;
        bool reverts;
        string reason;
    }

    struct MockSignature {
        bool initialized;
        string signature;
    }

    mapping(bytes32 => MockCall) mockConfig;
    mapping(bytes4 => MockSignature) mockSignatures;

    constructor(bytes4[] memory _sighashes, string[] memory _signatures) public {
        require(_sighashes.length == _signatures.length, "Signatures length mismatch");

        for (uint256 i = 0; i < _sighashes.length; i++) {
            mockSignatures[_sighashes[i]] = MockSignature({
                initialized: true,
                signature: _signatures[i]
            });
        }
    }

    fallback() external payable {
        MockCall memory mockCall = __doppelganger__internal__getMockCall();
        if (mockCall.reverts == true) {
            revert(string(abi.encodePacked("Mock revert: ", mockCall.reason)));
        }

        __doppelganger__internal__mockReturn(mockCall.value);
    }

    function __doppelganger__mockForward(bytes calldata _data, address _callee)
        external
        returns (bytes memory)
    {
        (bool success, bytes memory returnData) = _callee.call(_data);
        require(success, string(returnData));

        return returnData;
    }

    function __doppelganger__mockReset(bytes calldata _data) external {
        delete mockConfig[keccak256(_data)];
    }

    function __doppelganger__mockReverts(bytes calldata _data, string calldata _reason) external {
        mockConfig[keccak256(_data)] = MockCall({
            initialized: true,
            reverts: true,
            reason: _reason,
            value: ""
        });
    }

    function __doppelganger__mockReturns(bytes calldata _data, bytes calldata _value) external {
        mockConfig[keccak256(_data)] = MockCall({
            initialized: true,
            reverts: false,
            reason: "",
            value: _value
        });
    }

    function __doppelganger__internal__getMockCall()
        private
        view
        returns (MockCall memory mockCall)
    {
        mockCall = mockConfig[keccak256(msg.data)];
        if (mockCall.initialized == true) {
            // Mock method with specified arguments
            return mockCall;
        }

        mockCall = mockConfig[keccak256(abi.encodePacked(msg.sig))];
        if (mockCall.initialized == true) {
            // Mock method with any arguments
            return mockCall;
        }

        MockSignature memory mockSignature = mockSignatures[msg.sig];
        if (mockSignature.initialized == true) {
            // Mock method not initialized but signature is registered
            revert(string(abi.encodePacked("Mock not initialized: ", mockSignature.signature)));
        }

        revert("Mock not initialized");
    }

    function __doppelganger__internal__mockReturn(bytes memory ret) private pure {
        assembly {
            return(add(ret, 0x20), mload(ret))
        }
    }
}
