
import express from 'express';

import {PORT, REPLICATE_API_TOKEN, serverUrl, generators} from "./constants.js"

import {authenticate, requestAuthToken, isAuth} from './auth.js';

import {db} from "./db.js"

import {loadJSON, getAllPropertiesValid, writeFile} from './utils.js'


// save output to mongo on webhook
// hook up jwt
// admin/addtokens


//app.post("/sign_in", requestAuthToken);
// import ethers from "ethers";
// import jwt from "jsonwebtoken";

//import cors from "cors";
// import bodyParser from "body-parser";


// import {helloworld, connectToServer, getDb} from "./requests.js"

import Replicate from 'replicate-js'
//let Replicate = (await import("replicate-js")).Replicate
const replicate = new Replicate({token: REPLICATE_API_TOKEN});


function getCost(user, generator_name, config) {
  let cost = 0
  if (generator_name == 'stable-diffusion') {
    if (config.mode == 'generate') {
      cost = 1
    }
    else if (config.mode == 'interpolate') {
      cost = config.n_interpolate * config.interpolate_texts.length;
    }
  } else if (generator_name == 'clipx') {
    cost = 1;
  }
  return cost;
}

async function handleGeneratorRequest(req, res) {
  const {generator_name, config, token} = req.body;
  const user = decodeUserFromToken(token);

  // greet user
  // if user is new, check if they are elligible and give them some credits

  const generator = generators[generator_name]
  const defaultConfig = loadJSON(generator.configFile);

  if (!getAllPropertiesValid(defaultConfig, config)) {
    return res.status(400).send('Config contains unrecognized fields');
  }

  const instanceConfig = Object.assign(defaultConfig, config);
  const cost = getCost(user, generator_name, config)
  const {balance} = await db.collection('credits').findOne(user);
  
  // gateway
  const rateLimitHit = false; // Todo
  
  if (rateLimitHit) {
    return res.status(401).send('Rate limit hit, please try again later');
  }

  if (cost > balance) {
    return res.status(401).send('Not enough credits remaining');
  }

  // you shall pass
  const model = await replicate.getModel(generator.cog);
  const modelVersion = model.results[0].id;
  const webhookUrl = serverUrl+"/receive";
  const prediction = await replicate.startPrediction(
    modelVersion, 
    instanceConfig,
    webhookUrl
  );

  // cog failed
  if (prediction.status == 'failed') {
    res.status(500).send("Server error");
  } 

  // add a record of the request
  db.collection('requests').insertOne({
    timestamp: new Date().getTime(),
    generator: generator,
    config: config,
    cost: cost,
    replicate_id: prediction.id,
    status: 'pending'
  });

  // deduct credits  
  await db.collection('credits').updateOne(user, {$set: {balance: balance - cost}});

  res.status(200).send(prediction.id);
  
}

async function receiveGeneratorUpdate(req, res) {
  writeFile("./replicate.json", req.body)
  writeFile("./replicate_h.json", req.headers)
}



const app = express();

app.use(express.json());
app.use(express.urlencoded());

app.post("/request", authenticate, handleGeneratorRequest);
app.post("/receive", receiveGeneratorUpdate);
app.post("/sign_in", requestAuthToken);
app.post("/is_auth", isAuth);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
})

