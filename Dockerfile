FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
EXPOSE 3000
CMD ["node", "server/index.mjs"]
