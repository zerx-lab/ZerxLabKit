# syntax=docker/dockerfile:1

# --- Stage 1: build the SPA ---
FROM node:26-slim AS frontend
WORKDIR /app
RUN npm install -g pnpm@10.33.0
COPY web/package.json web/pnpm-lock.yaml ./web/
RUN cd web && pnpm install --frozen-lockfile
COPY web ./web
# vite outputs to ../internal/web/dist; ensure the parent exists.
RUN mkdir -p internal/web && cd web && pnpm build

# --- Stage 2: build the static Go binary ---
FROM golang:1.26-bookworm AS backend
WORKDIR /app
COPY go.mod go.sum ./
# Copy only what the server build needs (generated code is committed).
COPY cmd ./cmd
COPY internal ./internal
COPY gen ./gen
COPY --from=frontend /app/internal/web/dist ./internal/web/dist
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -tags netgo,osusergo \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /server ./cmd/server

# --- Stage 3: minimal runtime (no glibc) ---
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /home/nonroot
COPY --from=backend /server /server
EXPOSE 8080
USER 65532:65532
ENV DB_DRIVER=sqlite
# JWT_SECRET must be provided at runtime.
ENTRYPOINT ["/server"]
