FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5175

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --include=dev --workspace @yinian-zhipei/api --workspace @yinian-zhipei/admin-web --workspace @yinian-zhipei/shared

COPY apps/api apps/api
COPY apps/admin-web apps/admin-web
COPY packages/shared packages/shared

RUN npm run build -w @yinian-zhipei/admin-web
RUN npm run build -w @yinian-zhipei/api

EXPOSE 5175

CMD ["npm", "run", "start", "-w", "@yinian-zhipei/api"]
