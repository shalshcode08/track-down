BINARY := bin/server
CMD     := ./cmd/server

.PHONY: all build run dev clean test lint generate tidy

all: build

## build: compile the server binary
build:
	go build -o $(BINARY) $(CMD)

## run: build then run the server
run: build
	./$(BINARY)

## dev: run without building a binary (fast iteration)
dev:
	go run $(CMD)/main.go

## test: run all tests
test:
	go test ./...

## lint: run go vet
lint:
	go vet ./...

## generate: regenerate sqlc query code
generate:
	sqlc generate

## tidy: tidy and verify go modules
tidy:
	go mod tidy
	go mod verify

## clean: remove build artifacts
clean:
	rm -rf bin/

## help: list available targets
help:
	@grep -E '^## ' Makefile | sed 's/## /  /'
