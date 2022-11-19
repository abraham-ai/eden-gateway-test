
/*

api_keys
 - key
 - secret

users
 - userId
 - userType
 - balance

requests
 - timestamp
 - user
 - generator
 - config
 - application/metadata
 - output {nsfw, embeddings, sha, intermediate}

creations (?)
 - request
 - embeddings
 - nsfw

collections
 - id
 - user (or users)
 - name
 - requests []
 */



// TODO
// frontend for createNewAPIKey/admin
// error handling for all endpoints
// observability, stats, telemetry

// MISC
// make EDEN_STABLE_DIFFUSION_URL a secret
// db -> save both instanceconfig and user config



import express from 'express';
import cors from 'cors';

import {PORT, generators} from "./constants.js";
import {db} from "./db.js";
import * as utils from './utils.js';
import * as auth from './auth.js';
import * as replicate from "./replicate.js";
import * as eden from "./eden.js";
import * as collections from "./collections.js";


function getCost(generator_name, config) {
  let cost = 0
  if (generator_name == 'stable-diffusion') {
    if (config.mode == 'generate') {
      cost = 1
    }
    else if (config.mode == 'interpolate') {
      cost = config.n_frames;
    }
  } else if (generator_name == 'clipx') {
    cost = 1;
  }
  return cost;
}


async function handleFetchRequest(req, res) {
  const {taskIds, userIds} = req.body;
  const filter = {};
  if (taskIds) {
    filter["generator.task_id"] = {$in: taskIds};
  }
  if (userIds) {
    let userIds_ = await db.collection('users').find({"userId": {$in: userIds}}).toArray().map((user) => user._id);
    filter["user"] = {$in: userIds_};
  }
  const requests = await db.collection('requests').find(filter).toArray();
  return res.status(200).send(requests);
}


async function handleGeneratorRequest(req, res) {
  const {generator_name, config, application, metadata} = req.body;
  const userCredentials = auth.identifyUser(req);
  
  // get user entry in credits collection
  let user = await db.collection('users').findOne(userCredentials);
  
  // if user is not found, greet new user
  if (!user) {

    // check to see if user is eligible for free credits, otherwise stop
    if (userCredentials.userType == "ethereum") {
      const numTransactions = await utils.getAddressNumTransactions(userCredentials.userId);
      if (numTransactions < 3) {
        const msg = 'User has no credits, and ineligible for free credits';
        console.log(msg);
        return res.status(401).send(msg);
      }
    } 

    // new user is eligible: add to db, give free credits
    const newUser = await db.collection('users').insertOne({
      userId: userCredentials.userId,
      userType: userCredentials.userType,
      balance: 100
    });

    user = await db.collection('users').findOne(newUser.insertedId);
  }

  // get generator, instance config, and cost
  let generator = generators[generator_name];
  const defaultConfig = utils.loadJSON(generator.configFile);
  if (!utils.getAllPropertiesValid(defaultConfig, config)) {
    const msg = 'Config contains unrecognized fields';
    console.log(msg);
    return res.status(400).send(msg);
  }
  let instanceConfig = Object.assign(defaultConfig, config);
  const cost = getCost(generator_name, instanceConfig)

  // gateway
  const rateLimitHit = false; // Todo
  if (rateLimitHit) {
    return res.status(401).send('Rate limit hit, please try again later');
  }
  if (cost > user.balance) {
    const msg = 'Not enough credits remaining';
    console.log(msg);
    return res.status(401).send(msg);
  }
  
  /* ==> open sesame <== */
  
  // finally submit job
  const {task, generator_data} = await replicate.submit(generator, instanceConfig)  
  //const {task, generator_data} = await eden.submit(generator, instanceConfig)
  
  if (task.status == 'failed') {
    console.log("Server error: ", task.error);
    res.status(500).send("Server error "+task.error);
  }

  // create request document
  const application_data = {
    name: application, 
    metadata: metadata
  }  

  if (application == "eden.art") {
    application_data.stats = {
      praise_count: 0, burn_count: 0, praise_addresses: [''], burn_addresses: ['']
    }
  } 

  await db.collection('requests').insertOne({
    timestamp: new Date().getTime(),
    user: user._id,
    application: application_data,
    generator: generator_data,
    config: instanceConfig,
    cost: cost,
    status: 'pending'
  });
  
  await db.collection('users').updateOne({_id: user._id}, {
    $set: {balance: user.balance - cost}
  });
  
  return res.status(200).send(task.id);
}


const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'}));

app.post("/request", auth.authenticate, handleGeneratorRequest);
app.post("/fetch", handleFetchRequest);

app.post("/model_update_replicate", replicate.receiveGeneratorUpdate);
app.post("/model_update_eden", eden.receiveGeneratorUpdate);

app.post("/sign_in", auth.requestAuthToken);
app.post("/is_auth", auth.isAuthenticated);

app.post("/get_collections", collections.handleGetCollectionsRequest);
app.post("/create_collection", auth.authenticate, collections.handleCreateCollectionRequest);
app.post("/edit_collection", auth.authenticate, collections.handleEditCollectionRequest);


app.get("/", async (req, res) => {
  res.send("Gateway is running");
});

app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT} !`);
})
  
