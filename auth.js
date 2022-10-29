import ethers from "ethers";
import jwt from "jsonwebtoken";
import {JWT_SECRET} from "./constants.js"
import {db} from "./db.js"


export async function requestAuthToken(req, res) {
  const {message, signature, userId, userType, apiKey, apiSecret} = req.body;
  try {
    if (apiKey && apiSecret) {
      let key = await db.collection('api_keys').findOne({
        key: apiKey, secret: apiSecret
      });
      if (key) {
        const credentials = {userId: apiKey, userType: "api_key"};
        const authToken = jwt.sign(credentials, JWT_SECRET, {expiresIn: "90m"});
        res.status(200).json({authToken});
      }
      else {
        res.status(401).send("API key or secret invalid");
      }
    } 
    else if (message && signature && userId && userType) {
      const recovered = ethers.utils.verifyMessage(message, signature);
      if (userId.toLowerCase() === recovered.toLowerCase()) {
        const credentials = {userId: userId, userType: userType};
        const authToken = jwt.sign(credentials, JWT_SECRET, {expiresIn: "90m"});
        res.status(200).json({authToken});
      } else {      
        res.status(401).send("Mismatched address and signature");
      }
    }    
  } catch (error) {
    res.status(400).send(error.message);
  }
};


export function isAuth(req, res) {
  const {token} = req.body;
  try {
    jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).send(error.message);
  }
  res.status(200).json({token});
};


export async function authenticate(req, res, next) {
  if (process.env.GATEWAY_INTERNAL) {
    return next();
  }
  const {token} = req.body;
  if (!token) {
    return res.status(401).send("No token provided");
  }
  try {
    const user = decodeUserFromToken(token);
    if (!user) {
      return res.status(401).send("Can't decode token");
    }
  } catch (error) {
    return res.status(401).send(error.message);
  }
  return next();
}


export function decodeUserFromToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = {userId: decoded.userId, userType: decoded.userType};  
    return user;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
