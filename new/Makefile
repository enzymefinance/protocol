files =
all: clean extract
extract: out.json ok
	./extract_build.js out.json out
ok: out.json
	./ok.js out.json
out.json: in.json
	solc --standard-json < in.json > out.json
in.json:
	./generate_input.js $(files) > in.json
clean:
	rm -rf out in.json out.json
.PHONY: all extract ok clean
