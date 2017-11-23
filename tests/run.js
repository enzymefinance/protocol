import Jasmine from "jasmine";

const jasmine = new Jasmine();
jasmine.loadConfigFile("tests/jasmine.json");
jasmine.execute();
