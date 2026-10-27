
FROM golang:1.26-alpine AS builder
WORKDIR /src

COPY . .
RUN CGO_ENABLED=0 go build -o /out/simba .

FROM alpine:latest
WORKDIR /app

COPY --from=builder /out/simba /app/simba
COPY --from=builder /src/templates /app/templates

EXPOSE 8080
ENTRYPOINT ["/app/simba"]
