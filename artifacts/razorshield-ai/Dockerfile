FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY artifacts/razorshield-ai ./artifacts/razorshield-ai
RUN pnpm install --frozen-lockfile
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @workspace/razorshield-ai build

FROM nginx:1.27-alpine
COPY artifacts/razorshield-ai/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/artifacts/razorshield-ai/dist/public /usr/share/nginx/html
EXPOSE 80
