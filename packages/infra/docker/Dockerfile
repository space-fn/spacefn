# The image for a spacefn app on Bun. Its build context is .space/dist (what
# `space build` writes), so no source or dev dependency gets in. Run
# `space add docker` to copy this file to configs/docker/Dockerfile and change it.
ARG BUN_VERSION=1.4.4
FROM oven/bun:${BUN_VERSION}-slim

WORKDIR /app
COPY . .
# The server bundle is self-contained but for native packages, installed here
# for the image's platform.
RUN cd server && bun install --production --no-save \
	&& mkdir -p /data && chown bun:bun /data

ENV NODE_ENV=production PORT=3000 SPACE_DATA_DIR=/data
VOLUME /data
EXPOSE 3000
USER bun
# One container runs the web server, which starts the queue and cron processes.
CMD ["bun", "server/index.js"]
