FROM golang:1.24-bookworm AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY backend ./backend
RUN mkdir -p /app && CGO_ENABLED=1 go build -o /app/server ./backend/cmd/server

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

WORKDIR /app
COPY --from=build --chown=app:app /app/server /app/server
RUN chown app:app /app

USER app
EXPOSE 8000
CMD ["/app/server"]
