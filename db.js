import Minio from 'minio';
import {MongoClient} from 'mongodb';
import {mongo_url, db_name} from './constants.js'
import {minio_url, minio_access_key, minio_secret_key} from './constants.js'

const mongo = await MongoClient.connect(mongo_url);
export const db = mongo.db(db_name);

export const minio = new Minio.Client({
  endPoint: minio_url,
  accessKey: minio_access_key,
  secretKey: minio_secret_key
});
