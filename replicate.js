import axios from 'axios'
import Replicate from 'replicate-js'

import * as utils from './utils.js'
import {SERVER_URL, REPLICATE_API_TOKEN} from "./constants.js"

const replicate = new Replicate({
  token: REPLICATE_API_TOKEN
});

export async function submit(generator, config) {
  const replicateConfig = formatConfigForReplicate(config);

  const webhookSecret = utils.randomUUID();
  const webhookUrl = `${SERVER_URL}/model_update?secret=${webhookSecret}`;
  
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
