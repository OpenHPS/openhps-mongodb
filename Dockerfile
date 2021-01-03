FROM node:12

WORKDIR /opt/app
USER $UID:$GID
COPY package.json LICENSE /opt/app/
COPY src /opt/app/src/
COPY test test
RUN chown -R $UID:$GID /opt/app
RUN chmod 755 /opt/app
ENV NODE_ENV dev
RUN npm install