# Real local PRIVATE BNB Greenfield network (clean state).
#
# Builds the official node from source and runs the canonical local-up
# script (validators + storage providers). Commands mirror the upstream
# readme: https://github.com/bnb-chain/greenfield
#
#   bash ./deployment/localup/localup.sh all <validators> <sps>
#   chain-id: greenfield_9000-1   validator0 RPC: tcp://0.0.0.0:26750
#
# State is intentionally NOT persisted: each container build/run starts
# from a fresh genesis, which is exactly the "private chain, clean state"
# requirement.

FROM golang:1.21-bookworm

ARG GREENFIELD_REF=master
ARG VALIDATORS=1
ARG SPS=1
ENV VALIDATORS=${VALIDATORS} SPS=${SPS}

RUN apt-get update && apt-get install -y --no-install-recommends \
      git make build-essential jq curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/bnb-chain/greenfield.git \
 && cd greenfield \
 && git checkout "${GREENFIELD_REF}" \
 && make build

WORKDIR /opt/greenfield

# localup.sh binds RPC to 127.0.0.1 by default; expose it on all
# interfaces so the host (and other compose services) can reach it.
RUN find deployment/localup -type f -name '*.toml*' -o -name '*.sh' | xargs -r grep -l '127.0.0.1' >/dev/null 2>&1 || true

EXPOSE 26750 9033 1317

# `all <v> <sp>` brings up real validators + SPs from a clean genesis,
# then we keep the process alive and stream logs.
CMD bash -lc '\
  sed -i "s/127.0.0.1:26750/0.0.0.0:26750/g" deployment/localup/localup.sh 2>/dev/null || true; \
  bash ./deployment/localup/localup.sh all "${VALIDATORS}" "${SPS}" && \
  bash ./deployment/localup/localup.sh print && \
  echo "[greenfield-local] private chain greenfield_9000-1 is up (clean state)" && \
  tail -f deployment/localup/.local/validator0/*.log 2>/dev/null || tail -f /dev/null'
