FROM node:24-bookworm-slim AS binary
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# Digests from the official v1.18.23 release API, verified 2026-10-08. No latest/unpinned installer.
RUN case "$TARGETARCH" in \
      arm64) archive=opencode-linux-arm64.tar.gz; digest=86d3afaf4e8784f9adab189be2a315c12b27ec40a04b70defbe70595c3cc7c65 ;; \
      amd64) archive=opencode-linux-x64-baseline.tar.gz; digest=5f375b83a33ac67af12e0767baa3b987c8b9034c8f400f4a2e245c1cf371e897 ;; \
      *) exit 1 ;; \
    esac \
    && curl -fSL "https://github.com/anomalyco/opencode/releases/download/v1.18.23/$archive" -o /tmp/opencode.tar.gz \
    && printf '%s  %s\n' "$digest" /tmp/opencode.tar.gz | sha256sum -c - \
    && tar -xzf /tmp/opencode.tar.gz -C /tmp \
    && install -m 755 /tmp/opencode /usr/local/bin/opencode \
    && /usr/local/bin/opencode --version | grep -x 1.18.23

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home runner \
    && mkdir -p /data && chown runner:runner /data
COPY --from=binary /usr/local/bin/opencode /usr/local/bin/opencode
WORKDIR /srv/studpilot
COPY infra/opencode-runner ./infra/opencode-runner
COPY packages/shared/src/runner-auth.ts ./packages/shared/src/runner-auth.ts
USER runner
ENV RUNNER_HOST=0.0.0.0 PORT=8789 OPENCODE_EXECUTABLE=/usr/local/bin/opencode
ENV RUNNER_JOURNAL_PATH=/data/jobs.sqlite
EXPOSE 8789
CMD ["node", "infra/opencode-runner/service.mjs"]
