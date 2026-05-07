.PHONY: build clean

build:
	@mkdir -p out
	jsonnet -J vendor dashboard.jsonnet -o out/metrics.json
	@echo "✓ Dashboard compiled → out/metrics.json"

clean:
	rm -rf out
