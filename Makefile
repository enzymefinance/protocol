DIR = ./compile
files =
all: clean extract
thirdparty_contracts: extract
	cp thirdparty/* out/
extract: compile_out.json ok
	${DIR}/extract_build.js compile_out.json out
ok: compile_out.json
	${DIR}/check_compile_out.js compile_out.json
compile_out.json: compile_in.json
	solc --standard-json < compile_in.json > compile_out.json
compile_in.json:
	${DIR}/generate_input.js $(files) > compile_in.json
clean:
	rm -rf compile_in.json compile_out.json out
.PHONY: all extract ok clean
