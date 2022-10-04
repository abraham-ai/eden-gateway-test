import axios from 'axios'
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
      
      // refund them
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
        update.progress = getProgress(input, output);
      }
      await minio.putObject(MINIO_BUCKET, sha, base64image, metadata);
      await db.collection('requests').updateOne({_id: request._id}, {$set: update});
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
    const progress = output.length
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
