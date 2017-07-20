pragma solidity ^0.4.11;

import "./strings.sol";

contract DateTime {
        using strings for *;
        event Log(uint n);
        /*
         *  Date and Time utilities for ethereum contracts
         *
         */
        struct DateTime {
                uint16 year;
                uint8 month;
                uint8 day;
                uint8 hour;
                uint8 minute;
                uint8 second;
                uint8 weekday;
        }

        uint constant DAY_IN_SECONDS = 86400;
        uint constant YEAR_IN_SECONDS = 31536000;
        uint constant LEAP_YEAR_IN_SECONDS = 31622400;

        uint constant HOUR_IN_SECONDS = 3600;
        uint constant MINUTE_IN_SECONDS = 60;

        uint16 constant ORIGIN_YEAR = 1970;

        function isLeapYear(uint16 year) constant returns (bool) {
                if (year % 4 != 0) {
                        return false;
                }
                if (year % 100 != 0) {
                        return true;
                }
                if (year % 400 != 0) {
                        return false;
                }
                return true;
        }

        function leapYearsBefore(uint year) constant returns (uint) {
                year -= 1;
                return year / 4 - year / 100 + year / 400;
        }

        function getDaysInMonth(uint8 month, uint16 year) constant returns (uint8) {
                if (month == 1 || month == 3 || month == 5 || month == 7 || month == 8 || month == 10 || month == 12) {
                        return 31;
                }
                else if (month == 4 || month == 6 || month == 9 || month == 11) {
                        return 30;
                }
                else if (isLeapYear(year)) {
                        return 29;
                }
                else {
                        return 28;
                }
        }

        function parseTimestamp(uint timestamp) internal returns (DateTime dt) {
                uint secondsAccountedFor = 0;
                uint buf;
                uint8 i;

                // Year
                dt.year = getYear(timestamp);
                buf = leapYearsBefore(dt.year) - leapYearsBefore(ORIGIN_YEAR);

                secondsAccountedFor += LEAP_YEAR_IN_SECONDS * buf;
                secondsAccountedFor += YEAR_IN_SECONDS * (dt.year - ORIGIN_YEAR - buf);

                // Month
                uint secondsInMonth;
                for (i = 1; i <= 12; i++) {
                        secondsInMonth = DAY_IN_SECONDS * getDaysInMonth(i, dt.year);
                        if (secondsInMonth + secondsAccountedFor > timestamp) {
                                dt.month = i;
                                break;
                        }
                        secondsAccountedFor += secondsInMonth;
                }

                // Day
                for (i = 1; i <= getDaysInMonth(dt.month, dt.year); i++) {
                        if (DAY_IN_SECONDS + secondsAccountedFor > timestamp) {
                                dt.day = i;
                                break;
                        }
                        secondsAccountedFor += DAY_IN_SECONDS;
                }

                // Hour
                dt.hour = getHour(timestamp);

                // Minute
                dt.minute = getMinute(timestamp);

                // Second
                dt.second = getSecond(timestamp);

                // Day of week.
                dt.weekday = getWeekday(timestamp);
        }

        function getYear(uint timestamp) constant returns (uint16) {
                uint secondsAccountedFor = 0;
                uint16 year;
                uint numLeapYears;

                // Year
                year = uint16(ORIGIN_YEAR + timestamp / YEAR_IN_SECONDS);
                numLeapYears = leapYearsBefore(year) - leapYearsBefore(ORIGIN_YEAR);

                secondsAccountedFor += LEAP_YEAR_IN_SECONDS * numLeapYears;
                secondsAccountedFor += YEAR_IN_SECONDS * (year - ORIGIN_YEAR - numLeapYears);

                while (secondsAccountedFor > timestamp) {
                        if (isLeapYear(uint16(year - 1))) {
                                secondsAccountedFor -= LEAP_YEAR_IN_SECONDS;
                        }
                        else {
                                secondsAccountedFor -= YEAR_IN_SECONDS;
                        }
                        year -= 1;
                }
                return year;
        }

        function getMonth(uint timestamp) constant returns (uint8) {
                return parseTimestamp(timestamp).month;
        }

        function getDay(uint timestamp) constant returns (uint8) {
                return parseTimestamp(timestamp).day;
        }

        function getHour(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / 60 / 60) % 24);
        }

        function getMinute(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / 60) % 60);
        }

        function getSecond(uint timestamp) constant returns (uint8) {
                return uint8(timestamp % 60);
        }

        function getWeekday(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / DAY_IN_SECONDS + 4) % 7);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, 0, 0, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, hour, 0, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour, uint8 minute) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, hour, minute, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour, uint8 minute, uint8 second) constant returns (uint timestamp) {
                uint16 i;

                // Year
                for (i = ORIGIN_YEAR; i < year; i++) {
                        if (isLeapYear(i)) {
                                timestamp += LEAP_YEAR_IN_SECONDS;
                        }
                        else {
                                timestamp += YEAR_IN_SECONDS;
                        }
                }

                // Month
                uint8[12] memory monthDayCounts;
                monthDayCounts[0] = 31;
                if (isLeapYear(year)) {
                        monthDayCounts[1] = 29;
                }
                else {
                        monthDayCounts[1] = 28;
                }
                monthDayCounts[2] = 31;
                monthDayCounts[3] = 30;
                monthDayCounts[4] = 31;
                monthDayCounts[5] = 30;
                monthDayCounts[6] = 31;
                monthDayCounts[7] = 31;
                monthDayCounts[8] = 30;
                monthDayCounts[9] = 31;
                monthDayCounts[10] = 30;
                monthDayCounts[11] = 31;

                for (i = 1; i < month; i++) {
                        timestamp += DAY_IN_SECONDS * monthDayCounts[i - 1];
                }

                // Day
                timestamp += DAY_IN_SECONDS * (day - 1);

                // Hour
                timestamp += HOUR_IN_SECONDS * (hour);

                // Minute
                timestamp += MINUTE_IN_SECONDS * (minute);

                // Second
                timestamp += second;

                return timestamp;
        }

        function toMonth(string _month) constant returns(uint8) {
            if (sha3("Jan") == sha3(_month)) {
                return 1;
            }
            if (sha3("Feb") == sha3(_month)) {
                return 2;
            }
            if (sha3("Mar") == sha3(_month)) {
                return 3;
            }
            if (sha3("Apr") == sha3(_month)) {
                return 4;
            }
            if (sha3("May") == sha3(_month)) {
                return 5;
            }
            if (sha3("Jun") == sha3(_month)) {
                return 6;
            }
            if (sha3("Jul") == sha3(_month)) {
                return 7;
            }
            if (sha3("Aug") == sha3(_month)) {
                return 8;
            }
            if (sha3("Sep") == sha3(_month)) {
                return 9;
            }
            if (sha3("Oct") == sha3(_month)) {
                return 10;
            }
            if (sha3("Nov") == sha3(_month)) {
                return 11;
            }
            if (sha3("Dec") == sha3(_month)) {
                return 12;
            }
        }

        function parseInt(string _a, uint _b) internal returns (uint) {
            bytes memory bresult = bytes(_a);
            uint mint = 0;
            bool decimals = false;
            for (uint i=0; i<bresult.length; i++){
                if ((bresult[i] >= 48)&&(bresult[i] <= 57)){
                    if (decimals){
                       if (_b == 0) break;
                        else _b--;
                    }
                    mint *= 10;
                    mint += uint(bresult[i]) - 48;
                } else if (bresult[i] == 46) decimals = true;
            }
            if (_b > 0) mint *= 10**_b;
            return mint;
        }

        // Parse Date in IMF-fixdate format
        // Tue, 04 Apr 2017 11:12:58 GMT
        function parseDate(string _date) constant returns(uint) {
            var s = _date.toSlice();
            var delim = " ".toSlice();
            var timeDelim = ":".toSlice();
            //Cut out week day
            s.split(",".toSlice());
            //Cut out first space
            s.split(delim);
            // Get day
            uint8 day = uint8(parseInt(s.split(delim).toString(),0));
            uint8 month = toMonth(s.split(delim).toString());
            uint16 year = uint16(parseInt(s.split(delim).toString(), 0));
            uint8 hour = uint8(parseInt(s.split(timeDelim).toString(),0));
            uint8 minute = uint8(parseInt(s.split(timeDelim).toString(),0));
            uint8 second = uint8(parseInt(s.split(timeDelim).toString(),0));
            return toTimestamp(year, month, day, hour, minute, second);
        }
}
