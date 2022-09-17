import {MongoClient} from 'mongodb';
import {mongo_url, db_name} from './constants.js'

const client = await MongoClient.connect(mongo_url);

export const db = client.db(db_name);

