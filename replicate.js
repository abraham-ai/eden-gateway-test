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

let idxx = 1;
let idxxx = 1;


export async function receiveGeneratorUpdate(req, res) {
  
  // timestamp for now's time
  let current_time = new Date().getTime();
  let tttt = Math.random();
  utils.writeJsonToFile(`__test${current_time}_${tttt}.json`, req.body);
  
  res.status(200).send("Success");
}

export async function receiveGeneratorUpdate99(req, res) {
  const {id, status, input, output} = req.body;
  
  // timestamp for now's time
  let current_time = new Date().getTime();
  let tttt = Math.random();
  utils.writeJsonToFile(`__body${current_time}_${tttt}.json`, req.body);
  //idxx = idxx+ 1;


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
      
      // refund them
    });
  }
  else {

    
    if (output) {
      const lastOutputUrl = output.slice(-1)[0];
      const image = await download(lastOutputUrl);
      const fileType = utils.getFileType(lastOutputUrl);
      const base64image = Buffer.from(image.data, "base64");
      const sha = utils.sha256(base64image);
      const metadata = {'Content-Type': `image/${fileType}`, 'SHA': sha};

      utils.writeJsonToFile(`__status${current_time}_${tttt}.json`, {status: status});

      if (status == 'processing') {
        let update = {status: 'running', progress: getProgress(input, output)};
        let push = {intermediate_outputs: sha};
        // update.status = 'running';
        // update.progress = getProgress(input, output);
        
        // push and set at the same time
        //await db.collection('requests').updateOne({_id: request._id}, {$set: update, $push: push});
        db.collection('requests').updateOne({_id: request._id}, {$set: update, $push: push});
        
        //
      } 
      else if (status == 'succeeded') {
        let update = {status: 'complete', progress: 1.0, output: sha}
        // update.status = 'complete';
        // update.progress = 1.0;
        // update.output = sha;
        //await db.collection('requests').updateOne({_id: request._id}, {$set: update});        
        db.collection('requests').updateOne({_id: request._id}, {$set: update});        
//        let tttt2 = Math.random();
  //      utils.writeJsonToFile(`__progress${current_time}_${tttt2}.json`, {"progress": update.progress});
      } 
      else if (status == 'failed') {
        // todo

      }
      
      
      //await minio.putObject(MINIO_BUCKET, sha, base64image, metadata);
      minio.putObject(MINIO_BUCKET, sha, base64image, metadata);
      
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
  config['translation_x'] = config['translation'][0];
  config['translation_y'] = config['translation'][1];
  config['translation_z'] = config['translation'][2];
  config['rotation_x'] = config['rotation'][0];
  config['rotation_y'] = config['rotation'][1];
  config['rotation_z'] = config['rotation'][2];
  config['interpolation_texts'] = config['interpolation_texts'].join("|")
  config['interpolation_seeds'] = config['interpolation_seeds'].join("|")
  config['interpolation_init_images'] = config['interpolation_init_images'].join("|")
  config['init_image_file'] = config['init_image_file'] || null;
  config['mask_image_file'] = config['mask_image_file'] || null;
  config['init_video'] = config['mask_image_file'] || null;
  delete config['translation'];
  delete config['rotation'];
  if (!config['init_image_file']) {
    delete config['init_image_file'];
  }
  if (!config['mask_image_file']) {
    delete config['mask_image_file'];
  }
  if (!config['init_video']) {
    delete config['init_video'];
  }
  return config;
}
