

// TODO
// make EDEN_STABLE_DIFFUSION_URL a secret
// authenticate discord user
// db -> save both instanceconfig and user config
// observability, error handling
// admin/addtokens
// stats

import express from 'express';
import cors from 'cors';

import {PORT, generators} from "./constants.js"
import * as replicate from "./replicate.js"
import * as eden from "./eden.js"
import * as auth from './auth.js';
import * as utils from './utils.js'
import {db} from "./db.js"


function getCost(generator_name, config) {
  let cost = 0
  if (generator_name == 'stable-diffusion') {
    if (config.mode == 'generate') {
      cost = 1
    }
    else if (config.mode == 'interpolate') {
      cost = config.n_interpolate * config.interpolation_texts.length;
    }
  } else if (generator_name == 'clipx') {
    cost = 1;
  }
  return cost;
}

async function handleFetchRequest(req, res) {
  const {taskIds} = req.body;
  const requests = await db.collection('requests').find({"generator.task_id": {$in: taskIds}}).toArray();
  return res.status(200).send(requests);
}

async function handleGeneratorRequest(req, res) {
  const {generator_name, config, application, metadata, token} = req.body;
  const userCredentials = auth.decodeUserFromToken(token);
  
  // get user entry in credits collection
  let user = await db.collection('users').findOne(userCredentials);
  
  // if user is not found, greet new user
  if (!user) {
    if (userCredentials.userType == "ethereum") {
      const numTransactions = await utils.getAddressNumTransactions(userCredentials.userId);
      if (numTransactions < 0) {
        return res.status(401).send('User has no credits, and ineligible for free credits');
      }
    } 
    // create new user, give free credits
    const newUser = await db.collection('users').insertOne({
      userId: userCredentials.userId,
      userType: userCredentials.userType,
      balance: 100
    });    
    user = await db.collection('users').findOne(newUser.insertedId);
  }

  // get generator, config, and cost
  let generator = generators[generator_name]
  const defaultConfig = utils.loadJSON(generator.configFile);

  if (!utils.getAllPropertiesValid(defaultConfig, config)) {
    return res.status(400).send('Config contains unrecognized fields');
  }
  let instanceConfig = Object.assign(defaultConfig, config);
  const cost = getCost(generator_name, instanceConfig)

  // gateway
  const rateLimitHit = false; // Todo
  if (rateLimitHit) {
    return res.status(401).send('Rate limit hit, please try again later');
  }

  if (cost > user.balance) {
    return res.status(401).send('Not enough credits remaining');
  }
  
  // you shall pass; submit task to provider
  //const {task, generator_data} = await eden.submit(generator, instanceConfig)
  const {task, generator_data} = await replicate.submit(generator, instanceConfig)  
  
  if (task.status == 'failed') {
    res.status(500).send("Server error");
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
  
  res.status(200).send(task.id);
}


const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'}));

// app.post("/request", auth.authenticate, handleGeneratorRequest);
app.post("/request", handleGeneratorRequest);
app.post("/fetch", handleFetchRequest);

// app.post("/request", receiveGeneratorUpdate);
app.post("/model_update_replicate", replicate.receiveGeneratorUpdate);
app.post("/model_update_eden", eden.receiveGeneratorUpdate);

app.post("/sign_in", auth.requestAuthToken);
app.post("/is_auth", auth.isAuth);

app.post("/", (req, res) => {
  res.send("Hello world");
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT} !`);
})
  