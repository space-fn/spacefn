# The app's image on Bun, built from its source when `space deploy` runs configs/infra.ts.
# configs/Dockerfile.dockerignore keeps local files out of it.
ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY . .
# Without scripts: vite build generates .space/ itself.
RUN bun install --ignore-scripts && bunx vite build --config configs/vite.ts

FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app
COPY --from=build /app/dist .
# The server bundle is self-contained but for native packages, installed here for the image's platform.
RUN cd server && bun install --production --no-save \
	&& mkdir -p /data && chown bun:bun /data

ENV NODE_ENV=production PORT=3000 SPACE_DATA_DIR=/data
VOLUME /data
EXPOSE 3000
USER bun
# One container runs the web server, which starts the queue and cron processes.
CMD ["bun", "server/index.js"]
