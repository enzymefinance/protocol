import Jasmine from "jasmine";

const jasmine = new Jasmine();
jasmine.loadConfigFile("test/jasmine.json");
jasmine.execute();
