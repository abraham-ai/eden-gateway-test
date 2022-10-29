import axios from 'axios'
import url from 'url'
import Replicate from 'replicate-js'

import * as utils from './utils.js'
import {db, minio} from "./db.js"
import {SERVER_URL, REPLICATE_API_TOKEN, MINIO_BUCKET} from "./constants.js"

const replicate = new Replicate({
  token: REPLICATE_API_TOKEN
});


export async function submit(generator, config) {
  const replicateConfig = formatConfigForReplicate(config);

  const webhookSecret = utils.randomUUID();
  const webhookUrl = `${SERVER_URL}/model_update_replicate?secret=${webhookSecret}`;
  
  const model = await replicate.getModel(generator.cog);
  const modelVersion = model.results[0].id;

  const task = await replicate.startPrediction(
    modelVersion, 
    replicateConfig,
    webhookUrl
  );

  const generator_data = {
    service: "replicate",
    name: generator.cog,
    version: modelVersion,
    task_id: task.id,
    secret: webhookSecret
  }
  
  return {task, generator_data};
}


export async function receiveGeneratorUpdate(req, res) {
  const {completed_at, id, status, input, output} = req.body;
  

  // debug block
  let current_time = new Date().getTime();
  let tttt = Math.random();
  if (!completed_at) {
    res.status(200).send("Success");
    //utils.writeJsonToFile(`____progress${current_time}_${tttt}.json`, req.body);
    return;
  }
  utils.writeJsonToFile(`__body${current_time}_${tttt}.json`, req.body);



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

  // handle failures
  if (status == "failed") {
    
    // mark request failed
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: {status: "failed", error: req.body.error}
    });
    
    // refund user (todo: check this)    
    let user = await db.collection('users').findOne(request.user);
    await db.collection('users').updateOne({_id: user._id}, {
      $set: {balance: user.balance + request.cost}
    });
  }
  else {
    
    if (output) {
      const lastOutputUrl = output.slice(-1)[0];
      const asset = await download(lastOutputUrl);
      const assetB64 = Buffer.from(asset.data, "base64");
      const sha = utils.sha256(assetB64);
      const fileType = utils.getFileType(lastOutputUrl);
      const assetType = (fileType == "mp4") ? `video/${fileType}` : `image/${fileType}`;
      const metadata = {'Content-Type': assetType, 'SHA': sha};

      if (status == 'processing____') { // disabled for now
        let update = {status: 'running', progress: getProgress(input, output)};
        let push = {intermediate_outputs: sha};
        await db.collection('requests').updateOne({_id: request._id}, {
          $set: update, $push: push
        });
      } 
      else if (status == 'succeeded') {
        let update = {status: 'complete', progress: 1.0, output: sha}
        await db.collection('requests').updateOne({_id: request._id}, {
          $set: update
        });        
      } 
      else if (status == 'failed') {
        // todo
      }
      
      await minio.putObject(MINIO_BUCKET, sha, assetB64, metadata);
    }
  }

  res.status(200).send("Success");
}


export async function download(url) {
  const obj = await axios.get(url, {  
    headers: {
      'Authorization': "Token "+REPLICATE_API_TOKEN,
      'Content-Type': "application/json",
      'Accept': "application/json",      
    },
    responseType: 'arraybuffer',
  });
  return obj;
}


export function getProgress(input, output) {
  if (input.mode == 'generate') {
    const nFrames = 1 + Math.floor(input.steps / input.stream_every);
    const progress = output.length / nFrames;
    return progress;
  } else {
    const numFrames = input.n_interpolate * input.interpolation_texts.length;
    const progress = output.length / numFrames;  
    return progress;
  }
}


function formatConfigForReplicate(config) {
  const c = JSON.parse(JSON.stringify(config));
  c['translation_x'] = c['translation'][0];
  c['translation_y'] = c['translation'][1];
  c['translation_z'] = c['translation'][2];
  c['rotation_x'] = c['rotation'][0];
  c['rotation_y'] = c['rotation'][1];
  c['rotation_z'] = c['rotation'][2];
  c['interpolation_texts'] = c['interpolation_texts'].join("|")
  c['interpolation_seeds'] = c['interpolation_seeds'].join("|")
  c['interpolation_init_images'] = c['interpolation_init_images'].join("|")
  c['init_image_file'] = c['init_image_file'] || null;
  c['mask_image_file'] = c['mask_image_file'] || null;
  c['init_video'] = c['mask_image_file'] || null;
  delete c['translation'];
  delete c['rotation'];
  if (!c['init_image_file']) {
    delete c['init_image_file'];
  }
  if (!c['mask_image_file']) {
    delete c['mask_image_file'];
  }
  if (!c['init_video']) {
    delete c['init_video'];
  }
  return c;
}
