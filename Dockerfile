FROM node:12

WORKDIR /usr/src/app
COPY package.json LICENSE /usr/src/app/
COPY src /usr/src/app/src/
COPY test test
ENV NODE_ENV dev
RUN npm install