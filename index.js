

// TODO
// authenticate discord user
// db -> instanceconfig and user config
// observability, error handling
// admin/addtokens
// stats

import express from 'express';
import url from 'url';

import {PORT, MINIO_BUCKET, generators} from "./constants.js"
import * as replicate from "./replicate.js"
import * as auth from './auth.js';
import * as utils from './utils.js'
import {db, minio} from "./db.js"



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


async function receiveGeneratorUpdate(req, res) {
  utils.writeJsonToFile("./__body.json", req.body)
  const {id, status, completed_at, output} = req.body;
  
  // get the original request
  const request = await db.collection('requests').findOne({"generator.task_id": id});
  if (!request) {
    return res.status(500).send(`Request ${id} not found`);
  }
  
  // verify sender
  const webhookSecret = url.parse(req.url, true).query.secret;
  if (webhookSecret != request.generator.secret) {
    return res.status(500).send("Wrong secret token");
  }

  if (status == "failed") {
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: {status: "failed", error: req.body.error}
    });
  }
  else {
    if (output) {
      const lastOutputUrl = output.slice(-1)[0];
      const image = await replicate.download(lastOutputUrl);
      const fileType = utils.getFileType(lastOutputUrl);
      const base64image = Buffer.from(image.data, "base64");
      const sha = utils.sha256(base64image);
      const metadata = {'Content-Type': `image/${fileType}`, 'SHA': sha};
      let update = {output: sha};
      if (completed_at) {
        update.status = 'complete';
      } else {
        update.status = 'running';
        update.progress = replicate.getProgress(input, output);
      }
      await minio.putObject(MINIO_BUCKET, sha, base64image, metadata);
      await db.collection('requests').updateOne({_id: request._id}, {$set: update});
    }
  }

  res.status(200).send("done");
}





const app = express();

app.use(express.json());
app.use(express.urlencoded());

app.post("/request", auth.authenticate, handleGeneratorRequest);
//app.post("/request", handleGeneratorRequest);
// app.post("/request", receiveGeneratorUpdate);
app.post("/model_update", receiveGeneratorUpdate);

app.post("/sign_in", auth.requestAuthToken);
app.post("/is_auth", auth.isAuth);

console.log("hello 0")
  

app.post("/", (req, res) => {
  console.log("hello 1")
  res.send("Hello world");
});



app.listen(PORT, () => {
  console.log(`Listening on port ${PORT} !`);
  console.log("hello 5")
  
})

console.log("hello 3")
  