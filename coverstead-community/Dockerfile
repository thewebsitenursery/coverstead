FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN mkdir -p data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3100 ENV_FILE=/app/data/config.env
EXPOSE 3100
CMD ["node", "server.js"]
