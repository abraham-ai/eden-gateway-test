FROM node:alpine

WORKDIR /usr/src/app

COPY . .

RUN yarn install --frozen-lockfile

EXPOSE 80

ENTRYPOINT ["node", "index.js"]