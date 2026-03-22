# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder

ARG VP_VERSION=0.1.12
ARG VITE_API_BASE_URL=

WORKDIR /workspace/apps/web

RUN --mount=type=cache,target=/root/.npm \
    npm install -g vite-plus@${VP_VERSION}

# 先装依赖，再复制源码，减少无关改动触发的重装。
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    vp install --frozen-lockfile

COPY . .
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN vp run build

FROM nginx:1.27-alpine

# nginx 只负责提供静态资源、健康检查和 SPA 路由回退。
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
