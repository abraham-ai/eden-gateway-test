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
    webhookUrl,
    ["start", "output", "completed"]
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

  console.log(`Received update from Replicate for task ${id}: status ${status}`);

  // get the original request
  const request = await db.collection('requests').findOne({"generator.task_id": id});
  if (!request) {
    return res.status(500).send(`Request ${id} not found`);
  }

  // verify sender
  const webhookSecret = url.parse(req.url, true).query.secret;
  if (webhookSecret != request.generator.secret) {
    return res.status(500).send("Wrong webhook secret token");
  }

  // handle failures
  if (status == "failed") {    

    const error_message = req.body.error;

    // mark request failed
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: {status: "failed", error: error_message}
    });
    
    // refund user (todo: check this)    
    let user = await db.collection('users').findOne(request.user);
    await db.collection('users').updateOne({_id: user._id}, {
      $set: {balance: user.balance + request.cost}
    });

    return res.status(500).send(error_message);
  }

  // first update comes with no input, mark as "starting"
  if (!output) {
    let update = {status: 'starting', progress: 0};
    await db.collection('requests').updateOne({_id: request._id}, {$set: update});
    return res.status(200).send("Success");
  }

  // for updates that come with new output, upload to minio and update request
  if (!request.intermediate_outputs_replicate) {
    request.intermediate_outputs_replicate = [];
  }

  // give a list of all elements in output that don't exist in intermediate_outputs_replicate
  const newShas = [];
  const outputReplicate = output instanceof Array ? output : [output];
  const newOutputs = outputReplicate.filter(o => !request.intermediate_outputs_replicate.includes(o));
  for (const url of newOutputs) {
    const asset = await axios.get(url, {responseType: 'arraybuffer'});
    const assetB64 = Buffer.from(asset.data, "base64");
    const sha = utils.sha256(assetB64);
    const fileType = utils.getFileType(url);
    const assetType = (fileType == "mp4") ? `video/${fileType}` : `image/${fileType}`;
    const metadata = {'Content-Type': assetType, 'SHA': sha};
    console.log(` --> Uploading ${url} to ${MINIO_BUCKET}/${sha}`);
    await minio.putObject(MINIO_BUCKET, sha, assetB64, metadata);
    newShas.push(sha);
  }

  if (status == 'processing') {
    const update = {
      status: 'running', 
      progress: getProgress(input, outputReplicate),
      intermediate_outputs_replicate: outputReplicate
    };
    const push = {intermediate_outputs: {$each: newShas}};
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: update, $push: push
    });
  } 
  else if (status == 'succeeded') {
    const finalSha = newShas.slice(-1)[0];
    const update = {status: 'complete', progress: 1.0, output: finalSha}
    const deletion = {intermediate_outputs_replicate: 1};
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: update, $unset: deletion
    });        
  } 
  
  return res.status(200).send("Success");
}


export function getProgress(input, output) {
  if (!output) {
    return 0;
  }
  if (input.mode == 'generate' || input.mode == 'remix') {
    const nFrames = 1 + Math.floor(input.steps / input.stream_every);
    const progress = output.length / nFrames;
    return progress;
  } else {
    const progress = output.length / input.n_frames;  
    return progress;
  }
}


function formatConfigForReplicate(config) {
  const c = JSON.parse(JSON.stringify(config));
  if (c.translation) {
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
  }
  return c;
}
