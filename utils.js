import fs from 'fs';
import path from 'path'
import crypto from 'crypto';
import axios from 'axios';
import {ETHERSCAN_API_KEY} from "./constants.js"

export function randomUUID() {  
  return crypto.randomUUID();
}

export function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function writeFile(filename, content) {
  fs.writeFile(filename, content, function(error) {
    if (error) {
      return console.log(err);
    }
  });
}; 

export function writeJsonToFile(filename, text) {
  writeFile(filename, JSON.stringify(text));
}; 

export function getFileType(filename) {
  let fileType = path.extname(filename).slice(1).toLowerCase();
  fileType = (fileType == 'jpg') ? 'jpeg' : fileType;
  return fileType;
}

export function getAllPropertiesValid(obj_canonical, obj) {
  return Object.keys(obj).every(e => Object.keys(obj_canonical).includes(e));
}

export function sha256(data) {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(data);
  return hashSum.digest('hex');
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