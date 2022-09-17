import ethers from "ethers";
import jwt from "jsonwebtoken";
import {PORT, REPLICATE_API_TOKEN, jwtSecret, generators, minio_url, bucket_name} from "./constants.js"



export function requestAuthToken(req, res) {
  const {message, signature, id, id_type} = req.body;
  console.log(message, signature, id, id_type)
  try {
    const recovered = ethers.utils.verifyMessage(message, signature);
    console.log(recovered)
    if (id.toLowerCase() === recovered.toLowerCase()) {
      const credentials = {id: id, id_type: id_type};
      const authToken = jwt.sign(credentials, jwtSecret, {expiresIn: "30m"});
      res.status(200).json({authToken});
    } else {      
      res.status(401).send("Mismatched address and signature");
    }
  } catch (error) {
    res.status(400).send(error.message);
  }
};

export function isAuth(req, res) {
  const {token} = req.body;
  try {
    jwt.verify(token, jwtSecret);
  } catch (error) {
    return res.status(401).send(error.message);
  }
  res.status(200).json({token});
};


export async function authenticate(req, res, next) {
  if (process.env.GATEWAY_INTERNAL) {
    return next();
  } 

  if (req.body.api_key) {
    //return await checkAPIKey(req, res, next);    
  } 
  else {
    return await verifyJWT(req, res, next);
  }
}


const decodeUserFromToken = async (token) => {
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = {user_id: decoded.id, user_type: decoded.id_type};  
    return user;
  } catch (exceptionVar) {
    return null;
  }
};


const verifyJWT = async (req, res, next) => {
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
};

