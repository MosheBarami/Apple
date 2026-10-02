# Base image only. Node and pnpm come from the devcontainer feature and corepack (see
# on-create.sh); this file adds what CI installs by hand: Python 3, the Luau toolchain and Rojo.
# The versions are the ones .github/workflows/ci.yml pins; keep them equal.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG LUAU_VERSION=0.663
ARG ROJO_VERSION=7.7.0

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip unzip curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Luau (luau, luau-analyze, luau-compile) and Rojo are published as x86_64 Linux builds only. On any
# other architecture the build still succeeds and says so, because a container that cannot build at
# all is worse than one that lacks the plugin toolchain.
RUN set -eu; \
    arch="$(uname -m)"; \
    if [ "$arch" != "x86_64" ]; then \
      echo "WARNING: $arch is not x86_64, so Luau and Rojo are NOT installed (plugin build and Luau specs will not run)."; \
      exit 0; \
    fi; \
    curl -fsSL -o /tmp/luau.zip "https://github.com/luau-lang/luau/releases/download/${LUAU_VERSION}/luau-ubuntu.zip"; \
    unzip -q /tmp/luau.zip -d /usr/local/bin luau luau-analyze luau-compile; \
    chmod +x /usr/local/bin/luau /usr/local/bin/luau-analyze /usr/local/bin/luau-compile; \
    curl -fsSL -o /tmp/rojo.zip "https://github.com/rojo-rbx/rojo/releases/download/v${ROJO_VERSION}/rojo-${ROJO_VERSION}-linux-x86_64.zip"; \
    unzip -q /tmp/rojo.zip -d /usr/local/bin rojo; \
    chmod +x /usr/local/bin/rojo; \
    rm -f /tmp/luau.zip /tmp/rojo.zip

# Lune is not installed: nothing in this repository calls it.
