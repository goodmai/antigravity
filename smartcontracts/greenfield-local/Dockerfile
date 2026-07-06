# Real local PRIVATE BNB Greenfield network (clean state).
#
# Uses the pre-built gnfd binary from the official GHCR image instead of
# compiling from source, which reduces build time from ~20 min to ~1 min.
# The deployment/localup scripts are cloned at the matching release tag.
#
# State is intentionally NOT persisted: each container build/run starts
# from a fresh genesis, which is exactly the "private chain, clean state"
# requirement.

# Stage 1: extract the pre-built gnfd binary (matches latest release tag)
FROM ghcr.io/bnb-chain/greenfield:1.10.7 AS gnfd-bin
FROM ghcr.io/bnb-chain/greenfield-storage-provider:latest AS gnfd-sp-bin

# Stage 2: compile bootstrap_gvg using golang image
FROM golang:1.22-alpine AS gvg-builder
RUN apk add --no-cache git gcc musl-dev g++
ARG GREENFIELD_REF=v1.10.7
WORKDIR /opt
RUN git clone --depth=1 --branch "${GREENFIELD_REF}" \
      https://github.com/bnb-chain/greenfield.git
# Copy the local bootstrap_gvg.go file to /opt/greenfield/cmd/bootstrap_gvg/main.go
COPY bootstrap_gvg.go /opt/greenfield/cmd/bootstrap_gvg/main.go
WORKDIR /opt/greenfield/cmd/bootstrap_gvg
# Build the binary
RUN go build -o /app/bootstrap_gvg main.go

# Stage 3: runtime — same musl base as the gnfd binary (Alpine 3.17)
FROM alpine:3.17

ARG GREENFIELD_REF=v1.10.7
ARG VALIDATORS=1
ARG SPS=7
ENV VALIDATORS=${VALIDATORS} SPS=${SPS}

RUN apk add --no-cache bash git jq curl procps coreutils sed grep findutils \
      net-tools libstdc++ libgcc mariadb mariadb-client

# gnfd-sp links against libstdc++ (BLS via cgo); MariaDB backs the SP metadata
# and blocksyncer databases. Enable TCP so gnfd-sp can reach it on 127.0.0.1:3306
# (Alpine's mariadb defaults to socket-only with skip-networking).
RUN sed -i 's/^skip-networking/skip-networking=0\nport=3306\nbind-address=127.0.0.1\nskip-name-resolve/' \
      /etc/my.cnf.d/mariadb-server.cnf

# Copy pre-built binary from stage 1
COPY --from=gnfd-bin /app/gnfd /tmp/gnfd
COPY --from=gnfd-sp-bin /app/gnfd-sp /tmp/gnfd-sp

# Copy compiled bootstrap_gvg binary from stage 2
COPY --from=gvg-builder /app/bootstrap_gvg /usr/local/bin/bootstrap_gvg

WORKDIR /opt
RUN git clone --depth=1 --branch "${GREENFIELD_REF}" \
      https://github.com/bnb-chain/greenfield.git

WORKDIR /opt/greenfield

# Place binary where localup.sh expects it: build/bin/gnfd (relative to repo root)
RUN mkdir -p build/bin && cp /tmp/gnfd build/bin/gnfd && chmod +x build/bin/gnfd && cp /tmp/gnfd-sp build/bin/gnfd-sp && chmod +x build/bin/gnfd-sp

# v1.10.7 changed the default CHAIN_ID to greenfield_9000-121; pin it back
# to greenfield_9000-1 so the test assertion stays stable across versions.
RUN sed -i 's/^CHAIN_ID=.*/CHAIN_ID=greenfield_9000-1/' deployment/localup/.env

# Shift upgrade heights to run upgrades early in local testing environments (by height 12)
RUN sed -i 's/"Nagqu"\\nheight = 20/"Nagqu"\\nheight = 2/g' deployment/localup/localup.sh && \
    sed -i 's/"Pampas"\\nheight = 20/"Pampas"\\nheight = 2/g' deployment/localup/localup.sh && \
    sed -i 's/"Manchurian"\\nheight = 20/"Manchurian"\\nheight = 2/g' deployment/localup/localup.sh && \
    sed -i 's/"Hulunbeier"\\nheight = 21/"Hulunbeier"\\nheight = 3/g' deployment/localup/localup.sh && \
    sed -i 's/"HulunbeierPatch"\\nheight = 21/"HulunbeierPatch"\\nheight = 3/g' deployment/localup/localup.sh && \
    sed -i 's/"Ural"\\nheight = 22/"Ural"\\nheight = 4/g' deployment/localup/localup.sh && \
    sed -i 's/"Pawnee"\\nheight = 23/"Pawnee"\\nheight = 5/g' deployment/localup/localup.sh && \
    sed -i 's/"Serengeti"\\nheight = 24/"Serengeti"\\nheight = 6/g' deployment/localup/localup.sh && \
    sed -i 's/"Erdos"\\nheight = 25/"Erdos"\\nheight = 7/g' deployment/localup/localup.sh && \
    sed -i 's/"Veld"\\nheight = 26/"Veld"\\nheight = 8/g' deployment/localup/localup.sh && \
    sed -i 's/"Mongolian"\\nheight = 27/"Mongolian"\\nheight = 9/g' deployment/localup/localup.sh && \
    sed -i 's/"Savanna"\\nheight = 28/"Savanna"\\nheight = 10/g' deployment/localup/localup.sh && \
    sed -i 's/"Tundra"\\nheight = 29/"Tundra"\\nheight = 11/g' deployment/localup/localup.sh && \
    sed -i 's/"Prairie"\\nheight = 30/"Prairie"\\nheight = 12/g' deployment/localup/localup.sh && \
    sed -i 's/add-genesis-account \$validator_addr.*/&\n            \${bin} add-genesis-account 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf \${GENESIS_ACCOUNT_BALANCE}\${STAKING_BOND_DENOM} --home \${workspace}\/\.local\/validator\${i}/' deployment/localup/localup.sh

EXPOSE 26750 9033 1317

COPY setup_sp.sh /usr/local/bin/setup_sp.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/setup_sp.sh

CMD ["/usr/local/bin/entrypoint.sh"]
