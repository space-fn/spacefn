# In the spacefn repo, spacefn is a workspace link, which an image can't install, so this
# Dockerfile takes the dist/ that `space build` wrote. A new app's builds from source.
FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY dist .
RUN cd server && bun install --production --no-save \
	&& mkdir -p /data && chown bun:bun /data
ENV NODE_ENV=production PORT=3000 SPACE_DATA_DIR=/data
USER bun
CMD ["bun", "server/index.js"]
