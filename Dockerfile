FROM node:12

WORKDIR /opt/app
COPY package.json LICENSE /opt/app/
COPY src src
COPY test test
ENV NODE_ENV dev
RUN npm install