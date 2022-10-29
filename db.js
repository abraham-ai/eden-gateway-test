import Minio from 'minio';
import {MongoClient} from 'mongodb';

import {MONGO_URL, MONGO_DB_NAME} from './constants.js'
import {MINIO_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY} from './constants.js'

console.log("connect to DB ", MONGO_DB_NAME);

const mongo = await MongoClient.connect(MONGO_URL);
export const db = mongo.db(MONGO_DB_NAME);

export const minio = new Minio.Client({
  endPoint: MINIO_URL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});
