// db -> instanceconfig and user config
// admin/addtokens
// stats
// observability
// error handling

import express from 'express';
import url from 'url';

import {PORT, generators, minio_bucket} from "./constants.js"
import {db, minio} from "./db.js"
import {submit, download} from "./replicate.js"
import {authenticate, requestAuthToken, isAuth} from './auth.js';
import {getAllPropertiesValid, getAddressNumTransactions, loadJSON, writeJsonToFile, sha256} from './utils.js'



const instanceConfig2 = {
  mode: "interpolate",
  interpolation_texts: "Smurfs hijacking a car|A robot putting on makeup|An Ice hockey player",interpolation_seeds: "5|6|9",
  loop:false,
  n_interpolate:3,
  text_input:"An ice hockey player playing goaltender",translate_z:5, 
  animation_mode:"3D"
}

const instanceConfig3 = {
  mode: "generate",
  seed: 1289325,
  text_input: "Einstein having a dream, black and white sketch"
}

function getCost(user, generator_name, config) {
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
  //const user = decodeUserFromToken(token);
  const user = {
    user_id: "___",
    user_type: "discord"
  };

  // get user entry in credits collection
  const userCredits = await db.collection('credits').findOne(user);

  // greet user; if unrecognized wallet has 3 txs, give free credits
  if (!userCredits && user.user_type == "ethereum") {
    const numTransactions = getAddressNumTransactions(user.user_id);
    if (numTransactions >= 3) {
      await db.collection('credits').insertOne({
        user_id: user.user_id,
        user_type: user.user_type,
        balance: 10
      });
    } 
    else {
      return res.status(401).send('User has no credits, and ineligible for free credits');
    }
  }
  
  let generator = generators[generator_name]
  const defaultConfig = loadJSON(generator.configFile);
  const cost = getCost(user, generator_name, config)

  if (!getAllPropertiesValid(defaultConfig, config)) {
    return res.status(400).send('Config contains unrecognized fields');
  }

  let instanceConfig = Object.assign(defaultConfig, config);
  
  // gateway
  const rateLimitHit = false; // Todo
  if (rateLimitHit) {
    return res.status(401).send('Rate limit hit, please try again later');
  }

  if (cost > userCredits.balance) {
    return res.status(401).send('Not enough credits remaining');
  }

  // you shall pass
  const {task, generator_data} = await submit(generator, instanceConfig3)
  
  // job failed failed
  if (task.status == 'failed') {
    res.status(500).send("Server error");
  }

  // create request entry
  const application_data = {
    name: application, 
    metadata: metadata
  }  
  if (application == "eden.art") {
    application_data.stats = {
      praise_count: 0,
      burn_count: 0,
      praise_addresses: [''],
      burn_addresses: ['']
    }
  } 

  await db.collection('requests').insertOne({
    timestamp: new Date().getTime(),
    user: user,
    application: application_data,
    generator: generator_data,
    config: instanceConfig3,  // text_input/title/name
    cost: cost,
    status: 'pending'
  });
  
  await db.collection('credits').updateOne({_id: userCredits._id}, {
    $set: {balance: userCredits.balance - cost}
  });

  res.status(200).send(task.id);
}


async function receiveGeneratorUpdate(req, res) {
  //writeJsonToFile("./__body.json", req.body)
  //writeJsonToFile("./_header.json", req.headers)
  const {id, completed_at, output} = req.body;
  
  // get the original request
  const request = await db.collection('requests').findOne({"generator.task_id": id});
  if (!request) {
    return res.status(500).send(`Request ${id} not found`);
  }
  // writeJsonToFile("./__request.json", request)
  
  // verify sender
  const webhookSecret = url.parse(req.url, true).query.secret;
  if (webhookSecret != request.generator.secret) {
    return res.status(500).send("Wrong secret token");
  }
  // writeJsonToFile("./__webhook.json", {wh: webhookSecret})

  // save results
  if (output) {
    // writeJsonToFile("./__output1.json", {h:5})
    const lastOutputUrl = output.pop();
    // writeJsonToFile("./__outputa.json", {h: lastOutputUrl})
    const image = await download(lastOutputUrl);
    const base64image = Buffer.from(image.data, "base64");
    const sha = sha256(base64image);
    // writeJsonToFile("./__outputb.json", {h: sha})
    const metadata = {'Content-Type': 'image/jpeg', 'SHA': sha};
    const status = completed_at ? 'complete' : 'running';
    // writeJsonToFile("./__outputc.json", {d: status})
    // writeJsonToFile("./__output.json", {sha: sha, metadata: metadata, status: status})
    await minio.putObject(minio_bucket, sha, base64image, metadata);
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: {status: status, progress: 50, output: sha}
    });
  }
  // else {
  //   writeJsonToFile("./__output2.json", {h:0})
  // }
  // writeJsonToFile("./__end.json", {hello: 'world'})
  res.status(200).send("done");
}









const app = express();

app.use(express.json());
app.use(express.urlencoded());

//app.post("/request", authenticate, handleGeneratorRequest);
app.post("/request", handleGeneratorRequest);

// app.post("/request", receiveGeneratorUpdate);
app.post("/model_update", receiveGeneratorUpdate);
app.post("/sign_in", requestAuthToken);
app.post("/is_auth", isAuth);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
})

