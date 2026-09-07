FROM node:24.6.0-bookworm-slim AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && yarn install --immutable
COPY tsconfig*.json ./
COPY src ./src
RUN yarn build

FROM node:24.6.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system chat && useradd --system --gid chat --home-dir /nonexistent chat
COPY --from=build --chown=chat:chat /app/node_modules ./node_modules
COPY --from=build --chown=chat:chat /app/package.json ./package.json
COPY --from=build --chown=chat:chat /app/dist ./dist
USER chat
EXPOSE 3000
CMD ["node", "dist/server.js"]
