# Real local PRIVATE BNB Greenfield network (clean state).
#
# Uses the pre-built gnfd binary from the official GHCR image instead of
# compiling from source, which reduces build time from ~20 min to ~1 min.
# The deployment/localup scripts are cloned at the matching release tag.
#
#   bash ./deployment/localup/localup.sh all <validators> <sps>
#   chain-id: greenfield_9000-1   validator0 RPC: tcp://0.0.0.0:26750
#
# State is intentionally NOT persisted: each container build/run starts
# from a fresh genesis, which is exactly the "private chain, clean state"
# requirement.

# Stage 1: extract the pre-built gnfd binary (matches latest release tag)
FROM ghcr.io/bnb-chain/greenfield:latest AS gnfd-bin
FROM ghcr.io/bnb-chain/greenfield-storage-provider:latest AS gnfd-sp-bin

# Stage 2: runtime — same musl base as the gnfd binary (Alpine 3.17)
FROM alpine:3.17

ARG GREENFIELD_REF=v1.10.7
ARG VALIDATORS=1
ARG SPS=1
ENV VALIDATORS=${VALIDATORS} SPS=${SPS}

RUN apk add --no-cache bash git jq curl procps coreutils sed grep findutils

# Copy pre-built binary from stage 1
COPY --from=gnfd-bin /app/gnfd /tmp/gnfd
COPY --from=gnfd-sp-bin /app/gnfd-sp /tmp/gnfd-sp

WORKDIR /opt
RUN git clone --depth=1 --branch "${GREENFIELD_REF}" \
      https://github.com/bnb-chain/greenfield.git

WORKDIR /opt/greenfield

# Place binary where localup.sh expects it: build/bin/gnfd (relative to repo root)
RUN mkdir -p build/bin && cp /tmp/gnfd build/bin/gnfd && chmod +x build/bin/gnfd && cp /tmp/gnfd-sp build/bin/gnfd-sp && chmod +x build/bin/gnfd-sp

# v1.10.7 changed the default CHAIN_ID to greenfield_9000-121; pin it back
# to greenfield_9000-1 so the test assertion stays stable across versions.
RUN sed -i 's/^CHAIN_ID=.*/CHAIN_ID=greenfield_9000-1/' deployment/localup/.env

EXPOSE 26750 9033 1317

# `all <v> <sp>` brings up real validators + SPs from a clean genesis,
# then we keep the process alive and stream logs.
CMD bash -lc '\
  sed -i "s/127.0.0.1:26750/0.0.0.0:26750/g" deployment/localup/localup.sh 2>/dev/null || true; \
  bash ./deployment/localup/localup.sh all "${VALIDATORS}" "${SPS}" && \
  bash ./deployment/localup/localup.sh print && \
  echo "[greenfield-local] private chain greenfield_9000-1 is up (clean state)" && \
  tail -f deployment/localup/.local/validator0/*.log 2>/dev/null || tail -f /dev/null'
