FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script
ENV PLAYWRIGHT_BROWSERS_PATH=0

# 可选：构建时使用的 npm 源（国内可用 https://registry.npmmirror.com）
ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --include=dev --ignore-scripts
COPY . .
RUN npm run build
RUN rm -rf node_modules \
    && npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

WORKDIR /usr/src/microsoft-rewards-script
ENV NODE_ENV=production \
    TZ=UTC \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    FORCE_HEADLESS=1 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

RUN apt-get update && apt-get install -y --no-install-recommends \
    cron tzdata ca-certificates procps util-linux tini \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./
COPY --from=builder /usr/src/microsoft-rewards-script/node_modules ./node_modules

# Install the lockfile's matching Chromium headless shell.
# 容器内只跑无头模式（FORCE_HEADLESS=1），`--only-shell` 只装 headless shell，体积与耗时减半。
#
# 下载源默认走官方 CDN。国内可传 --build-arg PLAYWRIGHT_DOWNLOAD_HOST=<mirror> 加速，但要注意
# 镜像站可能滞后：截至 2026-11，npmmirror 只同步到 chromium revision 1200，而 patchright 1.64.2
# 需要 1248，硬编码镜像会直接 404（CI 实测）。所以这里不设默认值，只在显式传入时生效。
ARG PLAYWRIGHT_DOWNLOAD_HOST=""
RUN if [ -n "${PLAYWRIGHT_DOWNLOAD_HOST}" ]; then \
        PLAYWRIGHT_DOWNLOAD_HOST="${PLAYWRIGHT_DOWNLOAD_HOST}" \
        ./node_modules/.bin/patchright install --with-deps --only-shell chromium; \
    else \
        ./node_modules/.bin/patchright install --with-deps --only-shell chromium; \
    fi \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# The entrypoint prepares config/config.json from built-in defaults in the persisted config volume.
COPY --chmod=755 scripts/docker/run_daily.sh ./scripts/docker/run_daily.sh
COPY --chmod=755 scripts/docker/healthcheck.sh ./scripts/docker/healthcheck.sh
COPY scripts/lib/ ./scripts/lib/
COPY scripts/main/ ./scripts/main/
COPY --chmod=644 scripts/package.json ./scripts/package.json
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 scripts/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD ["scripts/docker/healthcheck.sh"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
