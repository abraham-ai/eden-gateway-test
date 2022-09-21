import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import {REPLICATE_API_TOKEN, ETHERSCAN_API_KEY} from "./constants.js"

export function randomUUID() {  
  return crypto.randomUUID();
}

export function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function writeFile(path, content) {
  fs.writeFile(path, content, function(error) {
    if (error) {
      return console.log(err);
    }
  });
}; 

export function writeJsonToFile(path, text) {
  writeFile(path, JSON.stringify(text));
}; 

export function getAllPropertiesValid(obj_canonical, obj) {
  return Object.keys(obj).every(e => Object.keys(obj_canonical).includes(e));
}

export function sha256(data) {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(data);
  return hashSum.digest('hex');
}

export async function pushToStorage(url) {
  const options = {  
    responseType: 'arraybuffer',
    headers: {
      'Authorization': "Token "+REPLICATE_API_TOKEN,
      'Content-Type': "application/json",
      'Accept': "application/json",      
    }
  }
  const image = await axios.get(url, options);

  const buffer = Buffer.from(image.data);
  const base64image = buffer.toString('base64');
  const sha = sha256(base64image);

  writeJsonToFile("./_sha2.json", {'data': sha})
  writeFile(sha, buffer);
  return sha;
}

export async function getAddressNumTransactions(address) {  
  try {
    const url = 'https://api.etherscan.io/api?module=account&action=txlist&address='+address+'&startblock=0&endblock=99999999&page=1&offset=100&sort=asc&apikey='+ETHERSCAN_API_KEY
    const results = await axios.get(url);
    return results.data.result.length;
  } catch (error) {
    console.log(error.message)
    return null;  // todo: what if api call fails
  }
}