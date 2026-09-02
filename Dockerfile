FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY lib ./lib
COPY public ./public
COPY server.js ./
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
