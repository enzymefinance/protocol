export PATH := compile:$(PATH)
files =
all: clean extract
extract: compile_out.json ok
	extract_build.js compile_out.json out
ok: compile_out.json
	ok.js compile_out.json
compile_out.json: compile_in.json
	solc --standard-json < compile_in.json > compile_out.json
compile_in.json:
	generate_input.js $(files) > compile_in.json
clean:
	rm -rf out in.json out.json
.PHONY: all extract ok clean
