// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.4.13;

contract DSTest {
    event eventListener          (address target, bool exact);
    event logs                   (bytes);
    event log_bytes32            (bytes32);
    event log_named_address      (bytes32 key, address val);
    event log_named_bytes32      (bytes32 key, bytes32 val);
    event log_named_decimal_int  (bytes32 key, int val, uint decimals);
    event log_named_decimal_uint (bytes32 key, uint val, uint decimals);
    event log_named_int          (bytes32 key, int val);
    event log_named_uint         (bytes32 key, uint val);

    bool public IS_TEST;
    bool public failed;
    bool SUPPRESS_SETUP_WARNING;  // hack for solc pure restriction warning

    function DSTest() internal {
        IS_TEST = true;
    }

    function setUp() public {
        SUPPRESS_SETUP_WARNING = true;  // totally unused by anything
    }

    function fail() internal {
        failed = true;
    }

    function expectEventsExact(address target) internal {
        eventListener(target, true);
    }

    modifier logs_gas() {
        uint startGas = msg.gas;
        _;
        uint endGas = msg.gas;
        log_named_uint("gas", startGas - endGas);
    }

    function assertTrue(bool condition) internal {
        if (!condition) {
            log_bytes32("Assertion failed");
            fail();
        }
    }

    function assertEq(address a, address b) internal {
        if (a != b) {
            log_bytes32("Error: Wrong `address' value");
            log_named_address("  Expected", b);
            log_named_address("    Actual", a);
            fail();
        }
    }

    function assertEq32(bytes32 a, bytes32 b) internal {
        assertEq(a, b);
    }

    function assertEq(bytes32 a, bytes32 b) internal {
        if (a != b) {
            log_bytes32("Error: Wrong `bytes32' value");
            log_named_bytes32("  Expected", b);
            log_named_bytes32("    Actual", a);
            fail();
        }
    }

    function assertEqDecimal(int a, int b, uint decimals) internal {
        if (a != b) {
            log_bytes32("Error: Wrong fixed-point decimal");
            log_named_decimal_int("  Expected", b, decimals);
            log_named_decimal_int("    Actual", a, decimals);
            fail();
        }
    }

    function assertEqDecimal(uint a, uint b, uint decimals) internal {
        if (a != b) {
            log_bytes32("Error: Wrong fixed-point decimal");
            log_named_decimal_uint("  Expected", b, decimals);
            log_named_decimal_uint("    Actual", a, decimals);
            fail();
        }
    }

    function assertEq(int a, int b) internal {
        if (a != b) {
            log_bytes32("Error: Wrong `int' value");
            log_named_int("  Expected", b);
            log_named_int("    Actual", a);
            fail();
        }
    }

    function assertEq(uint a, uint b) internal {
        if (a != b) {
            log_bytes32("Error: Wrong `uint' value");
            log_named_uint("  Expected", b);
            log_named_uint("    Actual", a);
            fail();
        }
    }

    function assertEq0(bytes a, bytes b) internal {
        bool ok = true;

        if (a.length == b.length) {
            for (uint i = 0; i < a.length; i++) {
                if (a[i] != b[i]) {
                    ok = false;
                }
            }
        } else {
            ok = false;
        }

        if (!ok) {
            log_bytes32("Error: Wrong `bytes' value");
            log_named_bytes32("  Expected", "[cannot show `bytes' value]");
            log_named_bytes32("  Actual", "[cannot show `bytes' value]");
            fail();
        }
    }
}
