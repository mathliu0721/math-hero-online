FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
VOLUME ["/app/.data"]
EXPOSE 8080
CMD ["node", "server/http.mjs"]
