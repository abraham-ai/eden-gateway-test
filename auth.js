import ethers from "ethers";
import jwt from "jsonwebtoken";
import {randomUUID} from "crypto";
import {JWT_SECRET} from "./constants.js"
import {db} from "./db.js"

export async function requestAuthToken(req, res) {
  const {message, signature, userId, userType, apiKey, apiSecret} = req.body;
  try {    
    if (apiKey && apiSecret) {
      try {
        const user = await decodeUserFromAPIKey(apiKey, apiSecret);
        const authToken = jwt.sign(user, JWT_SECRET, {expiresIn: "90m"});
        return res.status(200).json({authToken});
      } catch (error) {
        return res.status(401).send("API key or secret invalid");
      }
    } 
    else if (message && signature && userId && userType) {
      const recovered = ethers.utils.verifyMessage(message, signature);
      if (userId.toLowerCase() === recovered.toLowerCase()) {
        const credentials = {userId: userId, userType: userType};
        const authToken = jwt.sign(credentials, JWT_SECRET, {expiresIn: "90m"});
        return res.status(200).json({authToken});
      } else {      
        return res.status(401).send("Mismatched address and signature");
      }
    }
    else {
      return res.status(401).send("Must provide either signature or api key");
    }
  } catch (error) {
    res.status(400).send(error.message);
  }
}


export async function isAuthenticated(req, res) {
  try {
    const {token} = req.body;
    if (!token) {
      return res.status(401).send("No token provided");
    }
    decodeUserFromToken(token);
    return res.status(200).json({token});
  } catch (error) {
    return res.status(401).send(error.message);
  }
}


export async function authenticate(req, res, next) {
  try {
    await identifyUser(req);
    return next();
  } catch (error) {
    return res.status(401).send(error.message);
  }
}


export async function identifyUser(req) {
  const {token, apiKey, apiSecret} = req.body;
  if (apiKey && apiSecret && !token) {
    return await decodeUserFromAPIKey(apiKey, apiSecret);
  } 
  else if (token && !apiKey && !apiSecret) {
    return decodeUserFromToken(token);
  }
  else {
    throw new Error("Must provide either token or apiKey && apiSecret, but not both");
  }
}


function decodeUserFromToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = {userId: decoded.userId, userType: decoded.userType};  
    return user;
  } catch (error) {
    throw error;
  }
}


async function decodeUserFromAPIKey(apiKey, apiSecret) {
  try {
    const filter = {key: apiKey, secret: apiSecret};
    const key = await db.collection('api_keys').findOne(filter);
    if (key) {
      const user = {userId: apiKey, userType: "api_key"};
      return user;
    } else {
      throw new Error("API key or secret invalid");
    }
  } catch (error) {
    throw error;
  }
}


export async function createNewAPIKey(req, res) {
  /*const {note, balance} = req.body;
  try {
    let userId = randomUUID();
    let userSecret = randomUUID();
    await db.collection('api_keys').insertOne({
      key: userId, secret: userSecret, note: note
    });
    await db.collection('users').insertOne({
      userType: "api_key", userId: userId, balance: balance
    });
    return res.status(200).send({key: userId, secret: userSecret});
  } catch (error) {
    return res.status(500).send("Error creating new key: "+error.message);    
  }*/
  return res.status(500).send("Error creating new key: disabled");
}
